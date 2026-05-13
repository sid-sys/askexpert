import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { adminDb, FieldValue } from "@/lib/firebase-admin";
import { sendPushNotification } from "@/lib/notifications";
import {
  sendAskerConfirmationEmail,
  sendNewQuestionEmail,
  sendSubscriptionConfirmationEmail,
  sendNewSubscriberEmail,
} from "@/lib/resend";


export async function POST(req: NextRequest) {
  const sig     = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  console.log("📨 Received Stripe Webhook Event...");

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
    console.log(`📡 Event Type: ${event.type} [${event.id}]`);
  } catch (err: any) {
    console.error("⚠️ Webhook signature error:", err.message);
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // ── Idempotency guard ─────────────────────────────────────────────────────
  const eventRef  = adminDb.collection("processedEvents").doc(event.id);
  const eventSnap = await eventRef.get();
  if (eventSnap.exists) {
    console.log(`⏩ Event ${event.id} already processed. Skipping.`);
    return NextResponse.json({ ok: true, duplicate: true });
  }
  await eventRef.set({
    eventType:   event.type,
    processedAt: FieldValue.serverTimestamp(),
    expiresAt:   new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 1. checkout.session.completed — Asker paid for a question / creator sub
  // ─────────────────────────────────────────────────────────────────────────
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const meta    = session.metadata;

    console.log(`💳 Checkout Completed: ${session.id} | Paid: ${session.payment_status}`);

    // ── Only process our question/subscription checkouts ──────────────────
    if (!meta?.questionId) {
      console.log("ℹ️ No questionId in metadata. Likely a platform plan checkout.");
      return NextResponse.json({ ok: true });
    }

    // ── Subscription checkout (monthly fan → creator) ──────────────────────
    // This flow creates a subscription doc (no question doc) and fires
    // subscription-specific emails. The standalone "question" semantics are
    // only used for one-time payments.
    if (session.mode === "subscription") {
      try {
        const {
          creatorId, creatorName, followerEmail, followerName,
          followerUid, pricePaid, currency,
        } = meta as Record<string, string>;

        const creatorSnap = await adminDb.collection("users").doc(creatorId).get();
        const creatorData = creatorSnap.data() ?? {};
        const stripeCustomerId =
          typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
        const stripeSubscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;

        // Idempotency: if a sub doc for this Stripe subscription already exists, skip.
        if (stripeSubscriptionId) {
          const existing = await adminDb
            .collection("subscriptions")
            .where("stripeSubscriptionId", "==", stripeSubscriptionId)
            .limit(1)
            .get();
          if (!existing.empty) {
            console.log(`⏩ Subscription ${stripeSubscriptionId} already recorded. Skipping.`);
            return NextResponse.json({ ok: true, duplicate: true });
          }
        }

        await adminDb.collection("subscriptions").add({
          creatorId,
          creatorName: creatorName || creatorData.displayName || "Creator",
          creatorUsername: creatorData.username || null,
          followerId: followerUid || null,
          followerEmail,
          followerName: followerName || null,
          status: "active",
          pricePerMonth: parseInt(pricePaid),
          currency: currency ?? "usd",
          stripeCustomerId,
          stripeSubscriptionId,
          stripeSessionId: session.id,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          cancelledAt: null,
        });

        // Persist the Stripe customer on the fan's user doc so the billing
        // portal can be opened for managing/cancelling later.
        if (followerUid && stripeCustomerId) {
          await adminDb.collection("users").doc(followerUid).set(
            { stripeCustomerId, updatedAt: FieldValue.serverTimestamp() },
            { merge: true }
          );
        }

        // ── Count the subscription payment toward creator earnings ──────────
        // (Mirrors the one-time question flow so subscriptions affect the
        // creator's payout threshold and pendingPayoutBalance.)
        //
        // The fee tier active at the time of this payment is captured in
        // meta.feePercent at Checkout creation time. We accumulate the
        // creator's net + platform's cut as separate cumulative counters
        // so the payout-page breakdown stays accurate even after the
        // creator upgrades to a lower-fee tier later.
        const grossCents = parseInt(pricePaid);
        const subFeePercent = parseFloat(meta.feePercent ?? "20");
        const subFeeCents = Math.round(grossCents * (subFeePercent / 100));
        const subNetCents = grossCents - subFeeCents;
        await adminDb.collection("users").doc(creatorId).set(
          {
            totalEarnings: FieldValue.increment(grossCents),
            totalCreatorNet: FieldValue.increment(subNetCents),
            totalPlatformFee: FieldValue.increment(subFeeCents),
            // Subscription-specific bucket so the dashboard can show
            // "from subscriptions" separately from "from questions".
            subscriptionNetEarnings: FieldValue.increment(subNetCents),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        const platformPlan = (creatorData.platformPlan ?? "free") as string;
        const payoutMethod = (creatorData.payoutMethod ?? "manual_bank") as string;
        if (payoutMethod === "manual_bank") {
          const feePercent = parseFloat(meta.feePercent ?? "20");
          const feeCents = Math.round(grossCents * (feePercent / 100));
          const creatorNetCents = grossCents - feeCents;

          await adminDb.collection("pendingPayouts").add({
            creatorId,
            creatorName: creatorData.displayName ?? creatorName ?? "",
            creatorEmail: creatorData.email ?? "",
            amount: creatorNetCents,
            platformFeeAmount: feeCents,
            totalPaid: grossCents,
            currency: currency ?? "usd",
            paymentType: "subscription",
            stripeSubscriptionId,
            stripeSessionId: session.id,
            status: "pending",
            bankDetails: creatorData.bankDetails ?? null,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            paidAt: null,
            notes: "",
          });

          await adminDb.collection("users").doc(creatorId).set(
            {
              pendingPayoutBalance: FieldValue.increment(creatorNetCents),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }

        const results = await Promise.all([
          (async () => {
            try {
              await sendPushNotification({
                uid: creatorId,
                title: `🌟 New subscriber from ${followerName?.trim() || "a fan"}`,
                body: `${followerName?.trim() || followerEmail} just subscribed to your monthly plan.`,
                link: "/fans",
              });
              return "push_sent";
            } catch (e: any) { return `push_error: ${e.message}`; }
          })(),
          (async () => {
            try {
              await sendSubscriptionConfirmationEmail({
                to: followerEmail,
                creatorName: creatorName || creatorData.displayName || "your expert",
                creatorUsername: creatorData.username,
                price: parseInt(pricePaid),
                currency: currency ?? "usd",
              });
              return "fan_email_sent";
            } catch (e: any) { return `fan_email_error: ${e.message}`; }
          })(),
          (async () => {
            try {
              if (creatorData?.email) {
                await sendNewSubscriberEmail({
                  to: creatorData.email,
                  creatorName: creatorData.displayName || creatorName || "Creator",
                  subscriberEmail: followerEmail,
                  subscriberName: followerName,
                  price: parseInt(pricePaid),
                  currency: currency ?? "usd",
                  dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/fans`,
                });
                return "creator_email_sent";
              }
              return "creator_email_skipped";
            } catch (e: any) { return `creator_email_error: ${e.message}`; }
          })(),
        ]);

        console.log(`✅ [Webhook] Subscription processed:`, results);
      } catch (err: any) {
        console.error(`❌ [Webhook] Subscription processing failed:`, err.message, err.stack);
        return new NextResponse(`Processing Error: ${err.message}`, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    try {
      const {
        questionId, creatorId, creatorName, followerEmail, followerName,
        followerUid,
        content, pricePaid, expiresAt,
        payoutMethod, platformPlan, feePercent, creatorCut, currency,
      } = meta as Record<string, string>;

      console.log(`📝 Creating question ${questionId} for creator ${creatorId}...`);

      // Extract attachment URLs from metadata (att0, att1, etc.)
      const attachmentUrls: string[] = [];
      for (let i = 0; i < 5; i++) {
        const att = meta[`att${i}`];
        if (att) attachmentUrls.push(att);
      }

      // ── Create question doc ───────────────────────────────────────────────
      console.log(`[Webhook] Step 1: Writing question doc to Firestore...`);

      // ROI CHECK: Check if this asker was a vacation lead
      const vacSubSnap = await adminDb.collection("vacation_subscriptions")
        .where("creatorId", "==", creatorId)
        .where("userEmail", "==", followerEmail)
        .where("status", "in", ["pending", "notified"])
        .limit(1)
        .get();

      let isVacationConversion = false;
      if (!vacSubSnap.empty) {
        console.log(`🎯 Vacation lead conversion detected for ${followerEmail}!`);
        isVacationConversion = true;
        
        // Update subscription to converted
        const subDoc = vacSubSnap.docs[0];
        await subDoc.ref.update({
          status: "converted",
          convertedAt: FieldValue.serverTimestamp(),
          convertedQuestionId: questionId
        });
      }

      const creatorSnap = await adminDb.collection("users").doc(creatorId).get();
      const creatorData = creatorSnap.data() ?? {};
      const actualResponseTime = creatorData.responseTimeHours || 72;

      await adminDb.collection("questions").doc(questionId).set({
        id:                    questionId,
        content,
        response:              null,
        status:                "PENDING",
        pricePaid:             parseInt(pricePaid),
        followerEmail,
        followerName,
        // The fan's uid so the fan's /fan-dashboard "My Questions" tab
        // (which queries `where("followerUid", "==", user.uid)`) actually
        // returns the question they just paid for. Without this, paid
        // one-time questions never appear on the fan side.
        followerUid:           followerUid || null,
        creatorId,
        creatorName:           creatorName || creatorData.displayName || "The Creator",
        responseTimeHours:     actualResponseTime,
        stripePaymentIntentId: session.payment_intent || session.subscription || "",
        stripeChargeId:        null,
        stripeSessionId:       session.id,
        createdAt:             FieldValue.serverTimestamp(),
        updatedAt:             FieldValue.serverTimestamp(),
        answeredAt:            null,
        expiresAt:             new Date(expiresAt),
        payoutMethod:          payoutMethod ?? "manual_bank",
        notificationsSent:     false,
        isVacationConversion,
        attachmentUrls,
      });

      // ── Increment creator earnings counters ───────────────────────────────
      // Accumulate gross, the creator's net, and the platform's cut as three
      // separate cumulative fields. Computing them at payment time using the
      // fee % active right then (meta.feePercent) means we don't have to
      // re-derive the breakdown later — and the totals stay accurate even
      // after the creator changes plan tiers.
      console.log(`[Webhook] Step 2: Incrementing creator earnings for ${creatorId}...`);
      {
        const grossCentsAtPay = parseInt(pricePaid);
        const feePctAtPay     = parseFloat(feePercent ?? "20");
        const feeCentsAtPay   = Math.round(grossCentsAtPay * (feePctAtPay / 100));
        const netCentsAtPay   = grossCentsAtPay - feeCentsAtPay;
        await adminDb.collection("users").doc(creatorId).set(
          {
            totalEarnings:        FieldValue.increment(grossCentsAtPay),
            totalCreatorNet:      FieldValue.increment(netCentsAtPay),
            totalPlatformFee:     FieldValue.increment(feeCentsAtPay),
            // One-time-question bucket — mirrors subscriptionNetEarnings
            // on the subscription branch so the dashboard can split the
            // two streams without re-deriving them from the questions
            // collection on every load.
            oneTimeNetEarnings:   FieldValue.increment(netCentsAtPay),
            updatedAt:            FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      // ── If manual bank: write pendingPayout record ────────────────────────
      if (payoutMethod === "manual_bank") {
        console.log(`[Webhook] Step 3: Creating pendingPayout for ${creatorName}...`);

        const grossCents     = parseInt(pricePaid);
        const feeCents       = Math.round(grossCents * (parseFloat(feePercent ?? "20") / 100));
        const creatorNetCents = grossCents - feeCents;

        await adminDb.collection("pendingPayouts").add({
          creatorId,
          creatorName:       creatorName ?? creatorData.displayName ?? "",
          creatorEmail:      creatorData.email ?? followerEmail,
          amount:            creatorNetCents,
          platformFeeAmount: feeCents,
          totalPaid:         grossCents,
          currency:          currency ?? "usd",
          questionId,
          paymentType:       "per_question",
          status:            "pending",
          bankDetails:       creatorData.bankDetails ?? null,
          stripeSessionId:   session.id,
          createdAt:         FieldValue.serverTimestamp(),
          updatedAt:         FieldValue.serverTimestamp(),
          paidAt:            null,
          notes:             "",
        });

        console.log(`[Webhook] Step 3b: Updating creator balance...`);
        await adminDb.collection("users").doc(creatorId).set(
          { 
            pendingPayoutBalance: FieldValue.increment(creatorNetCents),
            updatedAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      }

      console.log(`[Webhook] Step 4: Preparing notification promises for ${questionId}...`);

      // ── Parallel notifications with settled status tracking ────────────────
      const notificationPromises = [
        // 1. Push to creator
        (async () => {
          try {
            await sendPushNotification({
              uid:   creatorId,
              title: `💰 New question from ${followerName?.trim() || "a fan"}`,
              body:  `"${(content ?? "").slice(0, 80)}..."`,
              link:  "/questions",
            });
            return "push_sent";
          } catch (e: any) {
            console.error(`[Webhook] Push Error:`, e.message);
            return `push_error: ${e.message}`;
          }
        })(),

        // 2. Email to asker
        (async () => {
          try {
            await sendAskerConfirmationEmail({
              to:          followerEmail,
              creatorName: creatorName ?? "your expert",
              question:    content ?? "",
              price:       parseInt(pricePaid),
              expiresAt:   expiresAt,
              currency:    currency ?? "usd",
              responseTimeHours: creatorData.responseTimeHours || 72,
            });
            return "asker_email_sent";
          } catch (e: any) {
            console.error(`[Webhook] Asker Email Error:`, e.message);
            return `asker_email_error: ${e.message}`;
          }
        })(),

        // 3. Email to creator
        (async () => {
          try {
            if (creatorData?.email) {
              await sendNewQuestionEmail({
                to: creatorData.email,
                creatorName: creatorData.displayName || creatorName || "Creator",
                question: content || "",
                askerEmail: followerEmail,
                askerName: followerName,
                price: parseInt(pricePaid),
                category: meta.category,
                requestedReplyFormat: meta.requestedReplyFormat,
                dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard`,
                responseTimeHours: creatorData.responseTimeHours || 72,
                attachmentUrls,
              });
              return "creator_email_sent";
            }
            return "creator_email_skipped";
          } catch (e: any) {
            console.error(`[Webhook] Creator Email Error:`, e.message);
            return `creator_email_error: ${e.message}`;
          }
        })(),
      ];

      console.log(`[Webhook] Step 5: Awaiting all notification results...`);
      const results = await Promise.all(notificationPromises);
      console.log(`[Webhook] Step 6: Results received:`, results);

      // ── Mark notifications as handled on the doc ─────────────────────────
      console.log(`[Webhook] Step 7: Finalizing question document...`);
      await adminDb.collection("questions").doc(questionId).update({
        notificationsSent: true,
        notificationSummary: results,
        updatedAt: FieldValue.serverTimestamp(),
      });

      console.log(`✅ [Webhook] FULL SUCCESS: Question ${questionId} processed.`);
    } catch (err: any) {
      console.error(`❌ [Webhook] FATAL CRASH for Question ${meta.questionId}:`, err.message, err.stack);
      return new NextResponse(`Processing Error: ${err.message}`, { status: 500 });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. customer.subscription.created / updated — Creator subscribes to platform plan
  // ─────────────────────────────────────────────────────────────────────────
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated"
  ) {
    const sub  = event.data.object as Stripe.Subscription;
    const meta = sub.metadata;

    if (!meta?.uid || !meta?.plan) return NextResponse.json({ ok: true });

    const { uid, plan } = meta;
    const status        = sub.status;

    if (status === "active" || status === "trialing") {
      // Also mirror the "scheduled cancellation" state so the /upgrade UI
      // can label the current-plan button as "Cancels on <date>" when the
      // creator hits Cancel in Stripe's Billing Portal.
      const cancelAtPeriodEnd = !!sub.cancel_at_period_end;
      const cpe = (sub as any).current_period_end as number | undefined;
      const planCurrentPeriodEnd = (typeof cpe === "number" && cpe > 0) ? new Date(cpe * 1000) : null;
      await adminDb.collection("users").doc(uid).set(
        {
          platformPlan:            plan,
          platformPlanStripeSubId: sub.id,
          stripeCustomerId:        typeof sub.customer === "string" ? sub.customer : sub.customer.id,
          planCancelAtPeriodEnd:   cancelAtPeriodEnd,
          planCurrentPeriodEnd:    planCurrentPeriodEnd,
          updatedAt:               FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      console.log(`🚀 Creator ${uid} on plan ${plan}${cancelAtPeriodEnd ? " (cancelling at period end)" : ""}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. customer.subscription.deleted — Creator cancelled platform plan
  // ─────────────────────────────────────────────────────────────────────────
  if (event.type === "customer.subscription.deleted") {
    const sub  = event.data.object as Stripe.Subscription;
    const meta = sub.metadata;

    // 3a. Platform plan subscription (creator's own AskExpert plan)
    if (meta?.uid) {
      await adminDb.collection("users").doc(meta.uid).set(
        {
          platformPlan: "free",
          platformPlanStripeSubId: null,
          planCancelAtPeriodEnd: false,
          planCurrentPeriodEnd: null,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      console.log(`⬇️  Creator ${meta.uid} downgraded to free (subscription cancelled)`);
      return NextResponse.json({ ok: true });
    }

    // 3b. Fan → creator subscription. No metadata on the Stripe sub itself;
    // match on stripeSubscriptionId stored in our subscriptions collection.
    const fanSubSnap = await adminDb
      .collection("subscriptions")
      .where("stripeSubscriptionId", "==", sub.id)
      .limit(1)
      .get();
    if (!fanSubSnap.empty) {
      const subDoc = fanSubSnap.docs[0];
      await subDoc.ref.update({
        status: "cancelled",
        cancelledAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`⬇️  Fan subscription ${sub.id} marked cancelled.`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. invoice.paid — Platform plan renewal (keep earnings in sync)
  // ─────────────────────────────────────────────────────────────────────────
  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    const sub     = (invoice as unknown as { subscription?: string | null }).subscription ?? null;
    if (!sub) return NextResponse.json({ ok: true });

    // Find creator by subscription ID
    const usersSnap = await adminDb
      .collection("users")
      .where("platformPlanStripeSubId", "==", sub)
      .limit(1)
      .get();

    if (!usersSnap.empty) {
      const creatorDoc = usersSnap.docs[0];
      // Confirm plan is still active
      await creatorDoc.ref.set(
        { 
          platformPlan: creatorDoc.data().platformPlan ?? "free",
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      console.log(`🔄 Platform plan invoice paid for ${creatorDoc.id}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. account.updated — Stripe Connect onboarding status change
  // ─────────────────────────────────────────────────────────────────────────
  if (event.type === "account.updated") {
    const account     = event.data.object as Stripe.Account;
    const firebaseUid = account.metadata?.firebaseUid;
    if (!firebaseUid) return NextResponse.json({ ok: true });

    const onboardingDone = account.details_submitted && account.charges_enabled;
    await adminDb.collection("users").doc(firebaseUid).set(
      {
        stripeOnboardingComplete: onboardingDone,
        payoutMethod: onboardingDone ? "stripe_connect" : "manual_bank",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    console.log(`🔗 Stripe Connect account ${account.id} updated for uid ${firebaseUid}. Done: ${onboardingDone}`);
  }

  return NextResponse.json({ ok: true });
}
