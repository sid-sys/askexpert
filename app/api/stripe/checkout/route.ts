import { NextRequest, NextResponse } from "next/server";
import { stripe, getPlatformFeePercent, computeApplicationFee, computeCreatorCut } from "@/lib/stripe";
import { adminDb } from "@/lib/firebase-admin";
import { applyPPP } from "@/lib/ppp";

export async function POST(req: NextRequest) {
  try {
    const { creatorId, content, followerEmail, followerName, mode, price, countryCode, attachmentUrls, followerUid } = await req.json();

    if (!creatorId || !followerEmail || !price) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Monthly subscription requires a logged-in user account
    if (mode === "monthly" && !followerUid) {
      return NextResponse.json({ error: "User account required for subscriptions. Please log in first." }, { status: 401 });
    }

    // ── Fetch creator profile ─────────────────────────────────────────────────
    const creatorSnap = await adminDb.collection("users").doc(creatorId).get();
    if (!creatorSnap.exists) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 });
    }
    const creator = creatorSnap.data()!;

    const platformPlan      = (creator.platformPlan      ?? "free") as string;
    const payoutMethod      = (creator.payoutMethod      ?? "manual_bank") as string;
    const stripeAccountId   = (creator.stripeAccountId   ?? null)  as string | null;
    const onboardingDone    = (creator.stripeOnboardingComplete ?? false) as boolean;
    const currency          = ((creator.currency ?? "usd") as string).toLowerCase();
    const responseTimeHours = (creator.responseTimeHours ?? 72) as number;
    const creatorName       = (creator.displayName       ?? "Creator") as string;
    const pppEnabled        = (creator.pppEnabled        ?? false) as boolean;

    // ── Apply PPP if enabled ──
    let finalPrice = price;
    if (pppEnabled && countryCode) {
      finalPrice = applyPPP(price, countryCode);
    }

    // ── Decide payout route ───────────────────────────────────────────────────
    const isConnectPayout =
      payoutMethod === "stripe_connect" && !!stripeAccountId && onboardingDone;

    // ── Platform fee based on creator plan ───────────────────────────────────
    const feePercent   = getPlatformFeePercent(platformPlan);
    const appFeeAmount = computeApplicationFee(price, platformPlan); // cents
    const creatorCut   = computeCreatorCut(price, platformPlan);     // cents

    // ── Placeholder question doc ──────────────────────────────────────────────
    const expiresAt   = new Date(Date.now() + responseTimeHours * 60 * 60 * 1000);
    const questionRef = adminDb.collection("questions").doc();

    // ── Build Checkout session params ─────────────────────────────────────────
    const isMonthly = mode === "monthly";

    const commonMetadata = {
      questionId:   questionRef.id,
      creatorId,
      creatorName,
      followerEmail,
      followerName,
      followerUid:  followerUid || "",
      content:      (content ?? "").slice(0, 500),
      pricePaid:    finalPrice.toString(),
      expiresAt:    expiresAt.toISOString(),
      payoutMethod: isConnectPayout ? "stripe_connect" : "manual_bank",
      platformPlan,
      feePercent:   feePercent.toString(),
      creatorCut:   creatorCut.toString(),
      currency,
      pppApplied:   (finalPrice < price) ? "true" : "false",
      originalPrice: price.toString(),
      responseTimeHours: responseTimeHours.toString(),
    };

    // Safely add up to 5 attachment URLs to metadata (Stripe has a 50 key limit, 500 chars per value)
    if (Array.isArray(attachmentUrls)) {
      attachmentUrls.slice(0, 5).forEach((url, index) => {
        if (typeof url === 'string' && url.length <= 500) {
          (commonMetadata as any)[`att${index}`] = url;
        }
      });
    }

    // ── One-time payment ──────────────────────────────────────────────────────
    if (!isMonthly) {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency,
              product_data: {
                name: "Expert Question",
                description: content ? content.slice(0, 100) : undefined,
              },
              unit_amount: finalPrice as number,
            },
            quantity: 1,
          },
        ],
        customer_email: followerEmail as string,
        success_url: `${process.env.NEXT_PUBLIC_APP_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${process.env.NEXT_PUBLIC_APP_URL}/`,
        metadata: commonMetadata,
        // automatic_tax: { enabled: true },
        ...(isConnectPayout && {
          payment_intent_data: {
            application_fee_amount: appFeeAmount,
            transfer_data: { destination: stripeAccountId! },
          },
        }),
      });
      return NextResponse.json({ url: session.url });
    }

    // ── Monthly subscription ──────────────────────────────────────────────────
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: "Monthly Expert Subscription",
              description: `Unlimited questions to ${creatorName} for 30 days`,
            },
            unit_amount: finalPrice as number,
            recurring: { interval: "month" },
          },
          quantity: 1,
        },
      ],
      customer_email: followerEmail as string,
      // After a subscription checkout, skip the standalone confirmation page and
      // drop the new subscriber straight into their fan dashboard. session_id is
      // still appended so the dashboard can run the same fallback sync if the
      // webhook hasn't landed yet.
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/fan-dashboard?session_id={CHECKOUT_SESSION_ID}&subscribed=1`,
      cancel_url:  `${process.env.NEXT_PUBLIC_APP_URL}/`,
      metadata: commonMetadata,
      // automatic_tax: { enabled: true },
      ...(isConnectPayout && {
        subscription_data: {
          application_fee_percent: feePercent,
          transfer_data: { destination: stripeAccountId! },
        },
      }),
    });
    return NextResponse.json({ url: session.url });

  } catch (err: any) {
    console.error("[checkout] error:", err);
    return NextResponse.json(
      { error: err.message || "Internal error" },
      { status: 500 }
    );
  }
}
