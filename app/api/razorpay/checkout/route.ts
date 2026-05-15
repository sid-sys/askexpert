import { NextRequest, NextResponse } from "next/server";
import { razorpay } from "@/lib/razorpay";
import { getPlatformFeePercent, computeApplicationFee, computeCreatorCut } from "@/lib/stripe";
import { adminDb } from "@/lib/firebase-admin";

// POST /api/razorpay/checkout
// Mirror of app/api/stripe/checkout/route.ts for INR-priced creators.
//
// Returns the Razorpay order/subscription details the client needs to open
// the Razorpay Checkout modal — NOT a redirect URL like Stripe. Razorpay
// uses an in-page modal (Checkout.js) so the success/cancel URL pattern
// doesn't apply; the client wires up handler() and modal.ondismiss instead.
//
// Response shape:
//   one-time:    { orderId, keyId, amount, currency, questionId, prefill }
//   monthly:     { subscriptionId, keyId, prefill }
export async function POST(req: NextRequest) {
  try {
    const { creatorId, content, followerEmail, followerName, followerPhone, mode, price, attachmentUrls, followerUid } = await req.json();

    if (!creatorId || !followerEmail || !price) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (mode === "monthly" && !followerUid) {
      return NextResponse.json({ error: "User account required for subscriptions. Please log in first." }, { status: 401 });
    }

    const creatorSnap = await adminDb.collection("users").doc(creatorId).get();
    if (!creatorSnap.exists) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 });
    }
    const creator = creatorSnap.data()!;

    const platformPlan      = (creator.platformPlan      ?? "free") as string;
    const currency          = ((creator.currency ?? "inr") as string).toUpperCase();
    const responseTimeHours = (creator.responseTimeHours ?? 72) as number;
    const creatorName       = (creator.displayName       ?? "Creator") as string;

    // Currency-based gateway routing happens client-side; this route assumes
    // the creator priced in INR. Reject anything else so we fail loud rather
    // than silently mis-charge in the wrong currency.
    if (currency !== "INR") {
      return NextResponse.json(
        { error: `Razorpay route requires INR pricing. Creator currency is ${currency}.` },
        { status: 400 }
      );
    }

    const finalPrice = price; // already in paise — frontend passes minor units

    const feePercent   = getPlatformFeePercent(platformPlan);
    const appFeeAmount = computeApplicationFee(price, platformPlan);
    const creatorCut   = computeCreatorCut(price, platformPlan);

    const expiresAt   = new Date(Date.now() + responseTimeHours * 60 * 60 * 1000);
    const questionRef = adminDb.collection("questions").doc();

    // Razorpay's "notes" field is the metadata equivalent. Up to 256 chars
    // per value, 15 keys max — we'll keep it tight and store the full set
    // in our processedEvents lookup if we need more.
    const commonNotes: Record<string, string> = {
      questionId:   questionRef.id,
      creatorId,
      creatorName:  creatorName.slice(0, 100),
      followerEmail,
      followerName: (followerName ?? "").slice(0, 100),
      followerUid:  followerUid || "",
      pricePaid:    finalPrice.toString(),
      expiresAt:    expiresAt.toISOString(),
      payoutMethod: "manual_bank",
      platformPlan,
      feePercent:   feePercent.toString(),
      creatorCut:   creatorCut.toString(),
      currency:     "inr",
      content:      (content ?? "").slice(0, 200),
      gateway:      "razorpay",
    };

    if (Array.isArray(attachmentUrls)) {
      attachmentUrls.slice(0, 3).forEach((url, index) => {
        if (typeof url === "string" && url.length <= 200) {
          commonNotes[`att${index}`] = url;
        }
      });
    }

    const isMonthly = mode === "monthly";

    const prefill: Record<string, string> = {
      name:  followerName ?? "",
      email: followerEmail,
    };
    // Razorpay's prefill.contact must be a 10-digit Indian mobile (with or
    // without +91). Strip non-digits and only set if it's a plausible
    // length so we don't trigger a "Invalid contact" modal error.
    if (typeof followerPhone === "string") {
      const digits = followerPhone.replace(/\D/g, "");
      if (digits.length >= 10) prefill.contact = digits.slice(-10);
    }

    // ── One-time payment ──────────────────────────────────────────────────────
    if (!isMonthly) {
      const order = await razorpay.orders.create({
        amount:   finalPrice as number,
        currency: "INR",
        receipt:  questionRef.id, // 40 char max — Firestore IDs are 20
        notes:    commonNotes,
      });

      return NextResponse.json({
        orderId:    order.id,
        keyId:      process.env.RAZORPAY_KEY_ID,
        amount:     order.amount,
        currency:   order.currency,
        questionId: questionRef.id,
        prefill,
        appFeeAmount, // surface for visibility — not used by Razorpay client
      });
    }

    // ── Monthly subscription (fan → creator) ──────────────────────────────────
    // Razorpay Subscriptions need a Plan, but we want per-creator pricing
    // (each creator sets their own monthly amount). So we create a fresh
    // Plan per subscription rather than reusing global plans. This mirrors
    // Stripe's price_data-inline pattern.
    const planForThisCreator = await razorpay.plans.create({
      period:   "monthly",
      interval: 1,
      item: {
        name:        `Monthly Subscription — ${creatorName}`,
        description: `Unlimited questions to ${creatorName}`,
        amount:      finalPrice as number,
        currency:    "INR",
      },
      notes: { creatorId, fanCheckout: "1" },
    });

    const subscription = await razorpay.subscriptions.create({
      plan_id:        planForThisCreator.id,
      customer_notify: 1,
      total_count:    120, // 10 years of monthly billing — effectively forever
      notes:          commonNotes,
    });

    return NextResponse.json({
      subscriptionId: subscription.id,
      keyId:          process.env.RAZORPAY_KEY_ID,
      prefill,
    });
  } catch (err: any) {
    console.error("[razorpay/checkout] error:", err);
    return NextResponse.json(
      { error: err.error?.description || err.message || "Internal error" },
      { status: 500 }
    );
  }
}
