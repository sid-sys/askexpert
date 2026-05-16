import { NextRequest, NextResponse } from "next/server";
import { razorpay } from "@/lib/razorpay";
import { getPlatformFeePercent, computeApplicationFee, computeCreatorCut } from "@/lib/stripe";
import { adminDb } from "@/lib/firebase-admin";
import { convertMinor } from "@/lib/fx";

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
    const creatorCurrency   = ((creator.currency ?? "inr") as string).toLowerCase();
    const responseTimeHours = (creator.responseTimeHours ?? 72) as number;
    const creatorName       = (creator.displayName       ?? "Creator") as string;

    // Razorpay can only collect in INR (India's payment gateway). When the
    // creator prices in USD/GBP/etc — which happens whenever an Indian fan
    // pays a non-Indian creator — we convert their price to INR paise before
    // creating the order. The original (creator-currency) amount is stamped
    // into notes so the webhook can back-compute creator earnings without
    // re-hitting the FX API.
    let chargeAmountPaise = price; // INR paise the fan actually pays
    let fxRate            = 1;     // creatorCurrency → INR multiplier
    if (creatorCurrency !== "inr") {
      const conv = await convertMinor(price, creatorCurrency, "inr");
      chargeAmountPaise = conv.amountMinor;
      fxRate            = conv.rate;
    }
    const finalPrice = chargeAmountPaise;

    // Platform fee is computed on the CREATOR-currency price so creator
    // earnings stay stable across FX wobble. We then convert the fee/cut
    // to paise only when reporting to the gateway (Razorpay doesn't itself
    // use these — they live in notes for the webhook).
    const feePercent     = getPlatformFeePercent(platformPlan);
    const appFeeCreator  = computeApplicationFee(price, platformPlan); // creator-ccy minor
    const creatorCut     = computeCreatorCut(price, platformPlan);     // creator-ccy minor
    const appFeeAmount   = Math.round(appFeeCreator * fxRate);         // paise (informational)

    const expiresAt   = new Date(Date.now() + responseTimeHours * 60 * 60 * 1000);
    const questionRef = adminDb.collection("questions").doc();

    // Razorpay's "notes" field is the metadata equivalent. Hard caps: up
    // to 256 chars per value, 15 KEYS MAX. We pack what we can to stay
    // under that limit. Derivable fields are dropped (the webhook
    // recomputes them) and the FX snapshot is packed into a single key.
    //
    // Format of `fx`: "<origAmt>:<origCcy>:<creatorAmt>:<creatorCcy>:<rate>"
    // Always present so webhooks have a uniform shape; collapses to
    // identical original/creator pair + rate=1 for INR-priced creators.
    const fxPacked = `${finalPrice}:inr:${price}:${creatorCurrency}:${fxRate}`;
    const commonNotes: Record<string, string> = {
      questionId:   questionRef.id,
      creatorId,
      followerEmail,
      followerName: (followerName ?? "").slice(0, 100),
      followerUid:  followerUid || "",
      // pricePaid stays in the gateway-charge currency (paise) — legacy
      // consumers read it as-is. fx gives the full split.
      pricePaid:    finalPrice.toString(),
      expiresAt:    expiresAt.toISOString(),
      payoutMethod: "manual_bank",
      platformPlan,
      feePercent:   feePercent.toString(),
      content:      (content ?? "").slice(0, 200),
      fx:           fxPacked,
    };
    // 12 fixed keys above, leaving 3 slots for attachment URLs. Each
    // attachment url is its own key (atts get long; packing would blow
    // the 256-char/value cap).
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
