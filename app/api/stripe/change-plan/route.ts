// POST /api/stripe/change-plan
//
// Plan change for paying users. The user picks one of two payment methods:
//
//   - "card"     : we cancel every existing platform sub (no proration so
//                  no credits get queued for later invoices), then return a
//                  fresh Stripe Checkout URL for the target plan at its
//                  full advertised price. The frontend redirects to the
//                  Checkout. Webhook reactivates platformPlan on success.
//
//   - "earnings" : the new plan's monthly fee is deducted from the
//                  creator's accrued totalEarnings, the existing sub is
//                  swapped to the new price with proration_behavior:"none"
//                  (so Stripe doesn't try to invoice anything), and the
//                  platformPlan / cumulative net+fee fields are updated
//                  locally. No Stripe charge is created.
//                  Returns 402 if accrued earnings can't cover the fee.
//
// Side-effect: any orphan duplicate platform-plan subscriptions on the
// customer get cancelled (prorate:false) so the Billing Portal stays clean.
//
// Body: { plan: "creator" | "pro", method: "card" | "earnings" }
// Auth: Firebase ID token in Authorization: Bearer <token>
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { adminAuth, adminDb, FieldValue } from "@/lib/firebase-admin";
import { PLAN_MONTHLY_FEE_CENTS } from "@/lib/stripe";

const PLAN_PRICES: Record<string, string | undefined> = {
  creator: process.env.STRIPE_CREATOR_PRICE_ID,
  pro:     process.env.STRIPE_PRO_PRICE_ID,
};

const PLATFORM_PRICE_IDS = [
  process.env.STRIPE_CREATOR_PRICE_ID,
  process.env.STRIPE_PRO_PRICE_ID,
  process.env.STRIPE_CREATOR_ANNUAL_PRICE_ID,
  process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
].filter(Boolean) as string[];

function isPlatformSub(s: Stripe.Subscription): boolean {
  if (s.status !== "active" && s.status !== "trialing" && s.status !== "past_due") return false;
  const priceId = s.items.data[0]?.price?.id;
  return !!priceId && PLATFORM_PRICE_IDS.includes(priceId);
}

export async function POST(req: NextRequest) {
  try {
    const idToken = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!idToken) return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    const body = await req.json() as { plan?: "creator" | "pro"; method?: "card" | "earnings" };
    const plan = body.plan;
    const method = body.method ?? "card";
    if (plan !== "creator" && plan !== "pro") return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    if (method !== "card" && method !== "earnings") return NextResponse.json({ error: "Invalid method" }, { status: 400 });

    const targetPriceId = PLAN_PRICES[plan];
    if (!targetPriceId) return NextResponse.json({ error: "Plan price not configured" }, { status: 500 });

    const userRef = adminDb.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const userData = userSnap.data() ?? {};
    const email = decoded.email ?? userData.email ?? "";

    // Locate / list platform subscriptions for this customer.
    let customerId = userData.stripeCustomerId as string | undefined;
    if (!customerId && email) {
      const search = await stripe.customers.list({ email, limit: 1 });
      if (search.data.length > 0) customerId = search.data[0].id;
    }

    const existingPlatformSubs: Stripe.Subscription[] = [];
    if (customerId) {
      const list = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 50 });
      existingPlatformSubs.push(...list.data.filter(isPlatformSub));
    }

    // ── Earnings path ────────────────────────────────────────────────────
    if (method === "earnings") {
      const feeCents = PLAN_MONTHLY_FEE_CENTS[plan] ?? 0;
      const earnings = (userData.totalEarnings ?? 0) as number;
      if (earnings < feeCents) {
        return NextResponse.json(
          {
            error: "INSUFFICIENT_EARNINGS",
            owedCents: feeCents - earnings,
            availableCents: earnings,
            requiredCents: feeCents,
          },
          { status: 402 },
        );
      }

      // Pick a keeper to swap (if any) so we don't double up. Otherwise
      // we just track the plan change locally — Stripe doesn't need a
      // subscription if the user is paying with earnings.
      const keeper = existingPlatformSubs[0];
      const dupes = existingPlatformSubs.slice(1);

      if (keeper) {
        await stripe.subscriptions.update(keeper.id, {
          items: [{ id: keeper.items.data[0].id, price: targetPriceId }],
          proration_behavior: "none",
          metadata: { uid, plan, paid_from: "earnings" },
        });
      }

      // Cancel dupes (and any sub we didn't keep) so the portal stays clean.
      for (const d of dupes) {
        try { await stripe.subscriptions.cancel(d.id, { prorate: false }); } catch (e: any) {
          console.error(`[change-plan] failed to cancel dupe ${d.id}:`, e?.message ?? e);
        }
      }

      await userRef.set({
        platformPlan: plan,
        platformPlanStripeSubId: keeper?.id ?? `earnings:${plan}`,
        totalEarnings: FieldValue.increment(-feeCents),
        lastPlanFeeChargedAt: FieldValue.serverTimestamp(),
        paymentDue: false,
        paymentDueCents: 0,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      return NextResponse.json({
        ok: true,
        plan,
        method: "earnings",
        deductedCents: feeCents,
        remainingEarningsCents: earnings - feeCents,
      });
    }

    // ── Card path ────────────────────────────────────────────────────────
    // Cancel every existing platform sub with prorate:false (no refund
    // credit queued — that was what produced the $0 invoices) and start
    // a fresh Checkout for the target plan at its full advertised price.
    const cancelledIds: string[] = [];
    for (const s of existingPlatformSubs) {
      try {
        await stripe.subscriptions.cancel(s.id, { prorate: false });
        cancelledIds.push(s.id);
      } catch (e: any) {
        console.error(`[change-plan] failed to cancel ${s.id}:`, e?.message ?? e);
      }
    }

    // Reset the locally-cached plan immediately so a refresh during the
    // Checkout flow doesn't show stale state.
    await userRef.set({
      platformPlan: "free",
      platformPlanStripeSubId: null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: targetPriceId, quantity: 1 }],
      customer: customerId,
      customer_email: customerId ? undefined : email,
      success_url: `${appUrl}/upgrade?plan_activated=${plan}`,
      cancel_url: `${appUrl}/upgrade?plan_cancelled=true`,
      metadata: { uid, plan, paid_from: "card" },
      subscription_data: { metadata: { uid, plan } },
    });

    return NextResponse.json({
      ok: true,
      method: "card",
      checkoutUrl: session.url,
      cancelledDuplicates: cancelledIds,
    });
  } catch (err: any) {
    console.error("[change-plan] error:", err);
    return NextResponse.json({ error: err.message ?? "change failed" }, { status: 500 });
  }
}
