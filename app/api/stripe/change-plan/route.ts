// POST /api/stripe/change-plan
//
// Swap the price on the user's existing Stripe subscription in place. Used
// for paid -> paid plan changes (creator -> pro, pro -> creator) so we don't
// end up with two parallel subscriptions for the same user. Stripe handles
// the prorated charge automatically.
//
// Body: { plan: "creator" | "pro" }
// Auth: Firebase ID token in Authorization: Bearer <token>
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { adminAuth, adminDb, FieldValue } from "@/lib/firebase-admin";

const PLAN_PRICES: Record<string, string | undefined> = {
  creator: process.env.STRIPE_CREATOR_PRICE_ID,
  pro:     process.env.STRIPE_PRO_PRICE_ID,
};

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

    // Find any existing platform subscription for this user. We prefer the
    // one we already cached on the user doc, but fall back to a Stripe
    // customer lookup so this still works when local state is stale.
    let subId = userData.platformPlanStripeSubId as string | undefined;
    let stripeSub: any = null;

    if (subId && !subId.startsWith("auto:")) {
      try {
        stripeSub = await stripe.subscriptions.retrieve(subId);
        if (stripeSub.status === "canceled" || stripeSub.status === "incomplete_expired") {
          stripeSub = null;
        }
      } catch {
        stripeSub = null;
      }
    }

    if (!stripeSub) {
      const customerId = userData.stripeCustomerId as string | undefined;
      if (customerId) {
        const list = await stripe.subscriptions.list({
          customer: customerId,
          status: "all",
          limit: 20,
        });
        // Prefer an active platform-plan subscription (matches one of our
        // env-pinned prices). Skip fan→creator subscriptions which would be
        // for someone else's monthly chat sub.
        stripeSub = list.data.find((s) => {
          if (s.status !== "active" && s.status !== "trialing") return false;
          const priceId = s.items.data[0]?.price?.id;
          return priceId === process.env.STRIPE_CREATOR_PRICE_ID
              || priceId === process.env.STRIPE_PRO_PRICE_ID
              || priceId === process.env.STRIPE_CREATOR_ANNUAL_PRICE_ID
              || priceId === process.env.STRIPE_PRO_ANNUAL_PRICE_ID;
        }) ?? null;
      }
    }

    if (!stripeSub) {
      return NextResponse.json(
        { error: "NO_EXISTING_SUBSCRIPTION", message: "No active Stripe subscription found — start with a fresh Checkout." },
        { status: 404 },
      );
    }

    const currentItem = stripeSub.items.data[0];
    const currentPriceId = currentItem.price.id;

    if (currentPriceId === targetPriceId) {
      // Already on the requested tier — just sync local state and return.
      await userRef.set(
        {
          platformPlan: plan,
          platformPlanStripeSubId: stripeSub.id,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return NextResponse.json({ ok: true, plan, subId: stripeSub.id, alreadyOnPlan: true });
    }

    // Swap the price on the existing subscription. Proration creates a single
    // upcoming invoice line for the difference; no second subscription gets
    // created.
    const updated = await stripe.subscriptions.update(stripeSub.id, {
      items: [{ id: currentItem.id, price: targetPriceId }],
      proration_behavior: "always_invoice",
      metadata: { uid, plan },
    });

    await userRef.set(
      {
        platformPlan: plan,
        platformPlanStripeSubId: updated.id,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return NextResponse.json({ ok: true, plan, subId: updated.id });
  } catch (err: any) {
    console.error("[change-plan] error:", err);
    return NextResponse.json({ error: err.message ?? "change failed" }, { status: 500 });
  }
}
