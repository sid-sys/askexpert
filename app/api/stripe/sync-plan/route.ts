// POST /api/stripe/sync-plan
//
// Pulls the authenticated user's latest subscription state from Stripe and
// mirrors it onto their users/{uid} doc (platformPlan, platformPlanStripeSubId,
// stripeCustomerId). Lets the /upgrade page reflect changes immediately after
// the Stripe Checkout redirect even when the webhook isn't running locally,
// and recovers from a cancellation by flipping platformPlan back to "free".
//
// Side-effect: if the user ended up with multiple active platform-plan
// subscriptions (legacy duplicates from earlier buggy upgrade flows), all
// but the kept one are cancelled so the Billing Portal stops showing
// them. The newest active sub is kept.
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { adminAuth, adminDb, FieldValue } from "@/lib/firebase-admin";

function resolvePlanFromSub(sub: Stripe.Subscription): "creator" | "pro" | null {
  // Prefer metadata that the checkout route wrote.
  const metaPlan = sub.metadata?.plan;
  if (metaPlan === "creator" || metaPlan === "pro") return metaPlan;
  // Fall back to matching the active price against our env-pinned plan prices.
  const priceId = sub.items.data[0]?.price?.id;
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_CREATOR_PRICE_ID || priceId === process.env.STRIPE_CREATOR_ANNUAL_PRICE_ID) return "creator";
  if (priceId === process.env.STRIPE_PRO_PRICE_ID || priceId === process.env.STRIPE_PRO_ANNUAL_PRICE_ID) return "pro";
  return null;
}

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

    const userRef = adminDb.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const userData = userSnap.data() ?? {};

    // Find a Stripe customer for this user — either the one we already cached
    // or by email lookup (covers the very first checkout where the Stripe
    // customer is created inside Checkout itself and we haven't recorded it).
    let customerId = userData.stripeCustomerId as string | undefined;
    if (!customerId && decoded.email) {
      const search = await stripe.customers.list({ email: decoded.email, limit: 1 });
      if (search.data.length > 0) customerId = search.data[0].id;
    }

    if (!customerId) {
      // No Stripe customer at all → user is on free, full stop.
      await userRef.set(
        {
          platformPlan: "free",
          platformPlanStripeSubId: null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return NextResponse.json({ plan: "free", subId: null, source: "no-customer" });
    }

    // Pull every subscription on the customer so we can:
    //   a) decide which platform sub is the keeper, and
    //   b) cancel any duplicates that snuck in from earlier buggy flows.
    const subsResp = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 50,
    });

    const platformSubs = subsResp.data.filter(isPlatformSub);

    // Keeper: prefer cached subId if it's still in the active list, else the
    // newest one. Anything else gets cancelled so the Billing Portal stops
    // showing duplicates.
    const cachedId = userData.platformPlanStripeSubId as string | undefined;
    const keeper = (cachedId && platformSubs.find((s) => s.id === cachedId))
      || platformSubs.slice().sort((a, b) => (b.created ?? 0) - (a.created ?? 0))[0]
      || null;

    const cancelledDuplicates: string[] = [];
    if (keeper) {
      const dupes = platformSubs.filter((s) => s.id !== keeper.id);
      for (const d of dupes) {
        try {
          await stripe.subscriptions.cancel(d.id, { prorate: true });
          cancelledDuplicates.push(d.id);
        } catch (e: any) {
          console.error(`[sync-plan] failed to cancel duplicate sub ${d.id}:`, e?.message ?? e);
        }
      }
    }

    let plan: "free" | "creator" | "pro" = "free";
    let activeSubId: string | null = null;
    if (keeper) {
      const resolved = resolvePlanFromSub(keeper);
      if (resolved) {
        plan = resolved;
        activeSubId = keeper.id;
      }
    }

    await userRef.set(
      {
        platformPlan: plan,
        platformPlanStripeSubId: activeSubId,
        stripeCustomerId: customerId,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return NextResponse.json({
      plan,
      subId: activeSubId,
      source: "stripe",
      cancelledDuplicates,
    });
  } catch (err: any) {
    console.error("[sync-plan] error:", err);
    return NextResponse.json({ error: err.message ?? "sync failed" }, { status: 500 });
  }
}
