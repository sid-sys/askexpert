import { NextRequest, NextResponse } from "next/server";
import { razorpay, RAZORPAY_PLAN_IDS } from "@/lib/razorpay";
import { adminDb } from "@/lib/firebase-admin";

// POST /api/razorpay/create-subscription-checkout
// Mirror of app/api/stripe/create-subscription-checkout for INR-priced
// platform plans (Indian creators upgrading their own AskExpert plan).
//
// Returns { subscriptionId, keyId, prefill } — client opens Razorpay
// Checkout modal with these.
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

    const planId = RAZORPAY_PLAN_IDS[plan.toLowerCase()];
    if (!planId) {
      return NextResponse.json(
        { error: `Unknown plan "${plan}". Valid plans: creator, pro. Did you run /api/razorpay/setup-products?` },
        { status: 400 }
      );
    }

    // Re-use existing Razorpay customer if one exists on the user doc.
    const userSnap = await adminDb.collection("users").doc(uid).get();
    const userData = userSnap.exists ? userSnap.data()! : {};
    const displayName = (userData.displayName ?? "Creator") as string;

    const subscription = await razorpay.subscriptions.create({
      plan_id:         planId,
      customer_notify: 1,
      total_count:     120, // 10y of monthly — effectively perpetual
      notes: {
        uid,
        plan,
        platformPlan: "1", // disambiguates from fan→creator subs in webhook
      },
    });

    return NextResponse.json({
      subscriptionId: subscription.id,
      keyId:          process.env.RAZORPAY_KEY_ID,
      prefill:        { name: displayName, email },
    });
  } catch (err: any) {
    console.error("[razorpay/create-subscription-checkout] error:", err);
    return NextResponse.json(
      { error: err.error?.description || err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
