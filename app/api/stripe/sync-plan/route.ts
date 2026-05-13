// POST /api/stripe/sync-plan
//
// Pulls the authenticated user's latest subscription state from Stripe and
// mirrors it onto their users/{uid} doc (platformPlan, platformPlanStripeSubId,
// stripeCustomerId). Lets the /upgrade page reflect changes immediately after
// the Stripe Checkout redirect even when the webhook isn't running locally,
// and recovers from a cancellation by flipping platformPlan back to "free".
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

    // Pull recent subscriptions. We ask for all statuses so a cancelled sub
    // still shows up and we can confidently drop the user back to "free".
    const subsResp = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 20,
    });

    let plan: "free" | "creator" | "pro" = "free";
    let activeSubId: string | null = null;
    for (const sub of subsResp.data) {
      if (sub.status !== "active" && sub.status !== "trialing") continue;
      const resolved = resolvePlanFromSub(sub);
      if (resolved) {
        plan = resolved;
        activeSubId = sub.id;
        break;
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

    return NextResponse.json({ plan, subId: activeSubId, source: "stripe" });
  } catch (err: any) {
    console.error("[sync-plan] error:", err);
    return NextResponse.json({ error: err.message ?? "sync failed" }, { status: 500 });
  }
}
