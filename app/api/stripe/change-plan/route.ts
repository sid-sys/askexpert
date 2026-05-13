// POST /api/stripe/change-plan
//
// Swap the price on the user's existing Stripe subscription in place. Used
// for paid -> paid plan changes (creator -> pro, pro -> creator) so we don't
// end up with two parallel subscriptions for the same user. Stripe handles
// the prorated charge automatically.
//
// Side-effect: if the user already has *multiple* active platform-plan
// subscriptions (from earlier buggy upgrade flows that double-subscribed
// instead of swapping), all but the one being kept are cancelled so the
// Billing Portal stops showing duplicates.
//
// Body: { plan: "creator" | "pro" }
// Auth: Firebase ID token in Authorization: Bearer <token>
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { adminAuth, adminDb, FieldValue } from "@/lib/firebase-admin";

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

    const { plan } = (await req.json()) as { plan: "creator" | "pro" };
    if (plan !== "creator" && plan !== "pro") {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }
    const targetPriceId = PLAN_PRICES[plan];
    if (!targetPriceId) return NextResponse.json({ error: "Plan price not configured" }, { status: 500 });

    const userRef = adminDb.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const userData = userSnap.data() ?? {};

    // Pull every platform-plan subscription this user owns so we can keep
    // one and cancel the rest. Fall back to email lookup if we don't have
    // a customer id cached yet.
    let customerId = userData.stripeCustomerId as string | undefined;
    if (!customerId && decoded.email) {
      const search = await stripe.customers.list({ email: decoded.email, limit: 1 });
      if (search.data.length > 0) customerId = search.data[0].id;
    }
    if (!customerId) {
      return NextResponse.json(
        { error: "NO_EXISTING_SUBSCRIPTION", message: "No Stripe customer on file — start with a fresh Checkout." },
        { status: 404 },
      );
    }

    const allSubs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 50,
    });
    const platformSubs = allSubs.data.filter(isPlatformSub);

    if (platformSubs.length === 0) {
      return NextResponse.json(
        { error: "NO_EXISTING_SUBSCRIPTION", message: "No active Stripe subscription found — start with a fresh Checkout." },
        { status: 404 },
      );
    }

    // Pick the keeper: prefer the cached subId if it's still in the active
    // platform-sub list; otherwise the newest one.
    const cachedId = userData.platformPlanStripeSubId as string | undefined;
    const keeper = (cachedId && platformSubs.find((s) => s.id === cachedId))
      || platformSubs.slice().sort((a, b) => (b.created ?? 0) - (a.created ?? 0))[0];
    const dupes = platformSubs.filter((s) => s.id !== keeper.id);

    // Cancel the duplicates first. We use cancel (immediate) instead of
    // schedule-cancel-at-period-end so the billing portal stops listing
    // them right away. Any prorated remaining-time refund is handled by
    // Stripe automatically.
    const cancelledIds: string[] = [];
    for (const d of dupes) {
      try {
        await stripe.subscriptions.cancel(d.id, { prorate: true });
        cancelledIds.push(d.id);
      } catch (e: any) {
        console.error(`[change-plan] failed to cancel duplicate sub ${d.id}:`, e?.message ?? e);
      }
    }

    const currentItem = keeper.items.data[0];
    const currentPriceId = currentItem.price.id;

    if (currentPriceId === targetPriceId) {
      // Keeper is already on the requested tier — no swap needed, just
      // make sure our cached state reflects reality and the duplicates
      // get reported.
      await userRef.set(
        {
          platformPlan: plan,
          platformPlanStripeSubId: keeper.id,
          stripeCustomerId: customerId,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return NextResponse.json({
        ok: true,
        plan,
        subId: keeper.id,
        alreadyOnPlan: true,
        cancelledDuplicates: cancelledIds,
      });
    }

    // Swap the price on the existing subscription. Proration creates a
    // single upcoming invoice line for the difference; no second
    // subscription gets created. Stripe re-uses the customer's existing
    // default payment method, so no Checkout redirect is needed.
    const updated = await stripe.subscriptions.update(keeper.id, {
      items: [{ id: currentItem.id, price: targetPriceId }],
      proration_behavior: "always_invoice",
      metadata: { uid, plan },
    });

    await userRef.set(
      {
        platformPlan: plan,
        platformPlanStripeSubId: updated.id,
        stripeCustomerId: customerId,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return NextResponse.json({
      ok: true,
      plan,
      subId: updated.id,
      cancelledDuplicates: cancelledIds,
    });
  } catch (err: any) {
    console.error("[change-plan] error:", err);
    return NextResponse.json({ error: err.message ?? "change failed" }, { status: 500 });
  }
}
