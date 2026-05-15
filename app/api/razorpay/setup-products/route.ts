import { NextRequest, NextResponse } from "next/server";
import { razorpay, PLAN_MONTHLY_FEE_PAISE } from "@/lib/razorpay";
import { adminDb, FieldValue } from "@/lib/firebase-admin";

// POST /api/razorpay/setup-products
// One-time endpoint: creates Creator + Pro Plans in Razorpay then stores
// the plan IDs in Firestore + returns them so they can be added to .env.local
// as RAZORPAY_CREATOR_PLAN_ID and RAZORPAY_PRO_PLAN_ID.
//
// Mirrors app/api/stripe/setup-products/route.ts. ADMIN ONLY.
export async function POST(req: NextRequest) {
  try {
    const { adminSecret } = await req.json();
    if (adminSecret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const results: Record<string, string> = {};

    // ── Creator Plan — ₹399/month ─────────────────────────────────────────
    const creatorPlan = await razorpay.plans.create({
      period:   "monthly",
      interval: 1,
      item: {
        name:        "AskExpert Creator Plan",
        description: "10% platform fee on all transactions. Custom branding & analytics.",
        amount:      PLAN_MONTHLY_FEE_PAISE.creator,
        currency:    "INR",
      },
      notes: { plan: "creator" },
    });
    results["RAZORPAY_CREATOR_PLAN_ID"] = creatorPlan.id;

    // ── Pro Plan — ₹799/month ─────────────────────────────────────────────
    const proPlan = await razorpay.plans.create({
      period:   "monthly",
      interval: 1,
      item: {
        name:        "AskExpert Pro Plan",
        description: "0% platform fee. Priority support, advanced analytics, custom branding.",
        amount:      PLAN_MONTHLY_FEE_PAISE.pro,
        currency:    "INR",
      },
      notes: { plan: "pro" },
    });
    results["RAZORPAY_PRO_PLAN_ID"] = proPlan.id;

    await adminDb.collection("config").doc("razorpayPlans").set({
      ...results,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      message: "Add these to your .env.local:",
      planIds: results,
    });
  } catch (err: any) {
    console.error("[razorpay/setup-products] error:", err);
    return NextResponse.json({ error: err.message ?? "Setup failed" }, { status: 500 });
  }
}
