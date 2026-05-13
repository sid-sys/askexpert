import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { adminDb } from "@/lib/firebase-admin";

const PLAN_PRICES: Record<string, string | undefined> = {
  creator: process.env.STRIPE_CREATOR_PRICE_ID,
  pro:     process.env.STRIPE_PRO_PRICE_ID,
};

export async function POST(req: NextRequest) {
  try {
    const { uid, email, plan } = (await req.json()) as {
      uid: string;
      email: string;
      plan: string;
    };

    if (!uid || !email || !plan) {
      return NextResponse.json({ error: "Missing uid, email, or plan" }, { status: 400 });
    }

    const priceId = PLAN_PRICES[plan.toLowerCase()];
    if (!priceId) {
      return NextResponse.json(
        { error: `Unknown plan "${plan}". Valid plans: creator, pro` },
        { status: 400 }
      );
    }

    // ── Re-use existing Stripe customer if they have one ──────────────────
    let stripeCustomerId: string | undefined;
    const userSnap = await adminDb.collection("users").doc(uid).get();
    if (userSnap.exists) {
      stripeCustomerId = (userSnap.data() as { stripeCustomerId?: string }).stripeCustomerId;
    }

    // ── Build Checkout Session ─────────────────────────────────────────────
    // NEXT_PUBLIC_APP_URL is what .env.local actually exports; the older
    // NEXT_PUBLIC_BASE_URL was never set, so success_url would resolve to
    // "undefined/dashboard..." and Stripe would reject the request.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer: stripeCustomerId,
      customer_email: stripeCustomerId ? undefined : email,
      success_url: `${appUrl}/upgrade?plan_activated=${plan}`,
      cancel_url: `${appUrl}/upgrade?plan_cancelled=true`,
      metadata: {
        uid,
        plan,
      },
      subscription_data: {
        metadata: { uid, plan },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[create-subscription-checkout] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
