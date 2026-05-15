import { NextRequest, NextResponse } from "next/server";
import { razorpay, validateRazorpayWebhookSignature } from "@/lib/razorpay";
import { adminDb, FieldValue } from "@/lib/firebase-admin";
import { sendPushNotification } from "@/lib/notifications";
import {
  sendAskerConfirmationEmail,
  sendNewQuestionEmail,
  sendSubscriptionConfirmationEmail,
  sendNewSubscriberEmail,
} from "@/lib/resend";

// POST /api/razorpay/webhook
// Mirror of app/api/stripe/webhook/route.ts adapted for Razorpay events:
//   order.paid              → one-time question paid (mode=payment)
//   subscription.activated  → fan→creator sub OR platform-plan sub started
//   subscription.charged    → recurring renewal (mirrors invoice.paid)
//   payment.failed          → card declined (mirrors invoice.payment_failed)
//   subscription.halted     → final retry exhausted
//   subscription.cancelled  → user/admin cancelled (mirrors customer.subscription.deleted)
//
// Razorpay events have no top-level event id, so the idempotency key is
// composed from event + entity id + created_at.
export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-razorpay-signature");
  const rawBody   = await req.text();

  console.log("📨 Received Razorpay Webhook Event...");

  if (!signature) {
    console.error("⚠️ Missing x-razorpay-signature header");
    return new NextResponse("Missing signature", { status: 400 });
  }

  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("⚠️ RAZORPAY_WEBHOOK_SECRET not configured");
    return new NextResponse("Server misconfigured", { status: 500 });
  }

  let valid = false;
  try {
    valid = validateRazorpayWebhookSignature(rawBody, signature, secret);
  } catch (err: any) {
    console.error("⚠️ Razorpay signature validation threw:", err.message);
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }
  if (!valid) {
    console.error("⚠️ Invalid Razorpay webhook signature");
    return new NextResponse("Invalid signature", { status: 400 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch (err: any) {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const eventType: string = payload.event;
  const createdAt: number = payload.created_at;
  console.log(`📡 Razorpay Event: ${eventType}`);

  // ── Idempotency guard (mirrors Stripe processedEvents pattern) ─────────
  const entityId =
    payload.payload?.payment?.entity?.id ||
    payload.payload?.subscription?.entity?.id ||
    payload.payload?.order?.entity?.id ||
    "unknown";
  const eventKey  = `rzp_${eventType.replace(/\./g, "_")}_${entityId}_${createdAt}`;
  const eventRef  = adminDb.collection("processedEvents").doc(eventKey);
  const eventSnap = await eventRef.get();
  if (eventSnap.exists) {
    console.log(`⏩ Razorpay event ${eventKey} already processed. Skipping.`);
    return NextResponse.json({ ok: true, duplicate: true });
  }
  await eventRef.set({
    eventType,
    gateway:     "razorpay",
    processedAt: FieldValue.serverTimestamp(),
    expiresAt:   new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 1. order.paid — One-time question payment completed
  // ─────────────────────────────────────────────────────────────────────────
  if (eventType === "order.paid") {
    const order   = payload.payload.order.entity;
    const payment = payload.payload.payment.entity;
    const meta    = (order.notes ?? {}) as Record<string, string>;

    if (!meta.questionId) {
      console.log("ℹ️ order.paid without questionId in notes. Skipping.");
      return NextResponse.json({ ok: true });
    }

    try {
      const {
        questionId, creatorId, creatorName, followerEmail, followerName,
        followerUid, content, pricePaid, expiresAt,
        payoutMethod, feePercent, currency,
      } = meta;

      // ROI: vacation-lead conversion check (mirrors Stripe path)
      const vacSubSnap = await adminDb.collection("vacation_subscriptions")
        .where("creatorId", "==", creatorId)
        .where("userEmail", "==", followerEmail)
        .where("status", "in", ["pending", "notified"])
        .limit(1)
        .get();

      let isVacationConversion = false;
      if (!vacSubSnap.empty) {
        isVacationConversion = true;
        await vacSubSnap.docs[0].ref.update({
          status: "converted",
          convertedAt: FieldValue.serverTimestamp(),
          convertedQuestionId: questionId,
        });
      }

      const creatorSnap = await adminDb.collection("users").doc(creatorId).get();
      const creatorData = creatorSnap.data() ?? {};
      const actualResponseTime = creatorData.responseTimeHours || 72;

      // Pull attachment URLs from notes (att0..att2)
      const attachmentUrls: string[] = [];
      for (let i = 0; i < 3; i++) {
        const a = meta[`att${i}`];
        if (a) attachmentUrls.push(a);
      }

      await adminDb.collection("questions").doc(questionId).set({
        id:                    questionId,
        content,
        response:              null,
        status:                "PENDING",
        pricePaid:             parseInt(pricePaid),
        followerEmail,
        followerName,
        followerUid:           followerUid || null,
        creatorId,
        creatorName:           creatorName || creatorData.displayName || "The Creator",
        responseTimeHours:     actualResponseTime,
        // Razorpay equivalents of Stripe IDs — keep separate fields so we
        // never confuse the two when looking up payments later.
        razorpayOrderId:       order.id,
        razorpayPaymentId:     payment.id,
        gateway:               "razorpay",
        createdAt:             FieldValue.serverTimestamp(),
        updatedAt:             FieldValue.serverTimestamp(),
        answeredAt:            null,
        expiresAt:             new Date(expiresAt),
        payoutMethod:          payoutMethod ?? "manual_bank",
        notificationsSent:     false,
        isVacationConversion,
        attachmentUrls,
      });

      // Earnings counters (paise — same minor-unit math as cents)
      const grossPaise = parseInt(pricePaid);
      const feePctAtPay = parseFloat(feePercent ?? "20");
      const feePaise = Math.round(grossPaise * (feePctAtPay / 100));
      const netPaise = grossPaise - feePaise;
      await adminDb.collection("users").doc(creatorId).set(
        {
          totalEarnings:      FieldValue.increment(grossPaise),
          totalCreatorNet:    FieldValue.increment(netPaise),
          totalPlatformFee:   FieldValue.increment(feePaise),
          oneTimeNetEarnings: FieldValue.increment(netPaise),
          updatedAt:          FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // Pending payout (manual_bank only — Razorpay flow is always manual_bank
      // in v1; we don't yet support Razorpay Route)
      await adminDb.collection("pendingPayouts").add({
        creatorId,
        creatorName:       creatorName ?? creatorData.displayName ?? "",
        creatorEmail:      creatorData.email ?? followerEmail,
        amount:            netPaise,
        platformFeeAmount: feePaise,
        totalPaid:         grossPaise,
        currency:          currency ?? "inr",
        questionId,
        paymentType:       "per_question",
        status:            "pending",
        bankDetails:       creatorData.bankDetails ?? null,
        razorpayOrderId:   order.id,
        razorpayPaymentId: payment.id,
        gateway:           "razorpay",
        createdAt:         FieldValue.serverTimestamp(),
        updatedAt:         FieldValue.serverTimestamp(),
        paidAt:            null,
        notes:             "",
      });

      await adminDb.collection("users").doc(creatorId).set(
        {
          pendingPayoutBalance: FieldValue.increment(netPaise),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      const results = await Promise.all([
        (async () => {
          try {
            await sendPushNotification({
              uid:   creatorId,
              title: `💰 New question from ${followerName?.trim() || "a fan"}`,
              body:  `"${(content ?? "").slice(0, 80)}..."`,
              link:  "/questions",
            });
            return "push_sent";
          } catch (e: any) { return `push_error: ${e.message}`; }
        })(),
        (async () => {
          try {
            await sendAskerConfirmationEmail({
              to:                followerEmail,
              creatorName:       creatorName ?? "your expert",
              question:          content ?? "",
              price:             parseInt(pricePaid),
              expiresAt:         expiresAt,
              currency:          currency ?? "inr",
              responseTimeHours: creatorData.responseTimeHours || 72,
            });
            return "asker_email_sent";
          } catch (e: any) { return `asker_email_error: ${e.message}`; }
        })(),
        (async () => {
          try {
            if (creatorData?.email) {
              await sendNewQuestionEmail({
                to:                creatorData.email,
                creatorName:       creatorData.displayName || creatorName || "Creator",
                question:          content || "",
                askerEmail:        followerEmail,
                askerName:         followerName,
                price:             parseInt(pricePaid),
                category:          meta.category,
                requestedReplyFormat: meta.requestedReplyFormat,
                dashboardUrl:      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard`,
                responseTimeHours: creatorData.responseTimeHours || 72,
                attachmentUrls,
              });
              return "creator_email_sent";
            }
            return "creator_email_skipped";
          } catch (e: any) { return `creator_email_error: ${e.message}`; }
        })(),
      ]);

      await adminDb.collection("questions").doc(questionId).update({
        notificationsSent: true,
        notificationSummary: results,
        updatedAt: FieldValue.serverTimestamp(),
      });

      console.log(`✅ [Razorpay Webhook] Question ${questionId} processed.`);
    } catch (err: any) {
      console.error(`❌ [Razorpay Webhook] order.paid crash:`, err.message, err.stack);
      return new NextResponse(`Processing Error: ${err.message}`, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. subscription.activated — First-time activation
  //    Two flavors distinguished by notes.platformPlan:
  //      "1" → creator's own platform plan upgrade
  //      else → fan → creator monthly subscription
  // ─────────────────────────────────────────────────────────────────────────
  if (eventType === "subscription.activated") {
    const sub  = payload.payload.subscription.entity;
    const meta = (sub.notes ?? {}) as Record<string, string>;

    // 2a. Platform plan upgrade
    if (meta.platformPlan === "1" && meta.uid && meta.plan) {
      await adminDb.collection("users").doc(meta.uid).set(
        {
          platformPlan:                 meta.plan,
          platformPlanRazorpaySubId:    sub.id,
          platformPlanGateway:          "razorpay",
          razorpayCustomerId:           sub.customer_id ?? null,
          planCancelAtPeriodEnd:        false,
          planCurrentPeriodEnd:         sub.current_end ? new Date(sub.current_end * 1000) : null,
          updatedAt:                    FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      console.log(`🚀 Creator ${meta.uid} on plan ${meta.plan} (Razorpay sub ${sub.id})`);
      return NextResponse.json({ ok: true });
    }

    // 2b. Fan → creator subscription
    if (!meta.creatorId) {
      console.log("ℹ️ subscription.activated without creatorId or platformPlan in notes. Skipping.");
      return NextResponse.json({ ok: true });
    }

    try {
      const { creatorId, creatorName, followerEmail, followerName,
              followerUid, pricePaid, currency } = meta;

      // Idempotency: skip if a sub doc for this Razorpay subscription
      // already exists.
      const existing = await adminDb
        .collection("subscriptions")
        .where("razorpaySubscriptionId", "==", sub.id)
        .limit(1)
        .get();
      if (!existing.empty) {
        console.log(`⏩ Subscription ${sub.id} already recorded. Skipping.`);
        return NextResponse.json({ ok: true, duplicate: true });
      }

      const creatorSnap = await adminDb.collection("users").doc(creatorId).get();
      const creatorData = creatorSnap.data() ?? {};

      await adminDb.collection("subscriptions").add({
        creatorId,
        creatorName: creatorName || creatorData.displayName || "Creator",
        creatorUsername: creatorData.username || null,
        followerId: followerUid || null,
        followerEmail,
        followerName: followerName || null,
        status: "active",
        pricePerMonth: parseInt(pricePaid),
        currency: currency ?? "inr",
        razorpayCustomerId: sub.customer_id ?? null,
        razorpaySubscriptionId: sub.id,
        gateway: "razorpay",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        cancelledAt: null,
      });

      // Persist customer on the fan's user doc for future portal-style use
      if (followerUid && sub.customer_id) {
        await adminDb.collection("users").doc(followerUid).set(
          { razorpayCustomerId: sub.customer_id, updatedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
      }

      // Credit the first-month earnings (mirrors Stripe path which credits
      // at checkout.session.completed for subscription mode)
      const grossPaise   = parseInt(pricePaid);
      const subFeePct    = parseFloat(meta.feePercent ?? "20");
      const subFeePaise  = Math.round(grossPaise * (subFeePct / 100));
      const subNetPaise  = grossPaise - subFeePaise;
      await adminDb.collection("users").doc(creatorId).set(
        {
          totalEarnings:           FieldValue.increment(grossPaise),
          totalCreatorNet:         FieldValue.increment(subNetPaise),
          totalPlatformFee:        FieldValue.increment(subFeePaise),
          subscriptionNetEarnings: FieldValue.increment(subNetPaise),
          updatedAt:               FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await adminDb.collection("pendingPayouts").add({
        creatorId,
        creatorName:       creatorData.displayName ?? creatorName ?? "",
        creatorEmail:      creatorData.email ?? "",
        amount:            subNetPaise,
        platformFeeAmount: subFeePaise,
        totalPaid:         grossPaise,
        currency:          currency ?? "inr",
        paymentType:       "subscription",
        razorpaySubscriptionId: sub.id,
        gateway:           "razorpay",
        status:            "pending",
        bankDetails:       creatorData.bankDetails ?? null,
        createdAt:         FieldValue.serverTimestamp(),
        updatedAt:         FieldValue.serverTimestamp(),
        paidAt:            null,
        notes:             "",
      });

      await adminDb.collection("users").doc(creatorId).set(
        {
          pendingPayoutBalance: FieldValue.increment(subNetPaise),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await Promise.all([
        (async () => {
          try {
            await sendPushNotification({
              uid: creatorId,
              title: `🌟 New subscriber from ${followerName?.trim() || "a fan"}`,
              body:  `${followerName?.trim() || followerEmail} just subscribed to your monthly plan.`,
              link:  "/fans",
            });
          } catch (e: any) { console.error(`[Razorpay Webhook] push:`, e.message); }
        })(),
        (async () => {
          try {
            await sendSubscriptionConfirmationEmail({
              to:              followerEmail,
              creatorName:     creatorName || creatorData.displayName || "your expert",
              creatorUsername: creatorData.username,
              price:           parseInt(pricePaid),
              currency:        currency ?? "inr",
            });
          } catch (e: any) { console.error(`[Razorpay Webhook] fan email:`, e.message); }
        })(),
        (async () => {
          try {
            if (creatorData?.email) {
              await sendNewSubscriberEmail({
                to:              creatorData.email,
                creatorName:     creatorData.displayName || creatorName || "Creator",
                subscriberEmail: followerEmail,
                subscriberName:  followerName,
                price:           parseInt(pricePaid),
                currency:        currency ?? "inr",
                dashboardUrl:    `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/fans`,
              });
            }
          } catch (e: any) { console.error(`[Razorpay Webhook] creator email:`, e.message); }
        })(),
      ]);

      console.log(`✅ [Razorpay Webhook] Fan subscription ${sub.id} activated.`);
    } catch (err: any) {
      console.error(`❌ [Razorpay Webhook] subscription.activated crash:`, err.message, err.stack);
      return new NextResponse(`Processing Error: ${err.message}`, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. subscription.charged — Recurring renewal (mirrors invoice.paid)
  //    For now: just clear any past_due flag and bump timestamps.
  //    NOTE: We don't credit per-renewal earnings — this matches the Stripe
  //    path (which only credits at signup, not on each invoice.paid). Both
  //    gateways have this same gap; fix in both at once when ready.
  // ─────────────────────────────────────────────────────────────────────────
  if (eventType === "subscription.charged") {
    const sub = payload.payload.subscription.entity;

    // Platform plan
    const creatorSnap = await adminDb
      .collection("users")
      .where("platformPlanRazorpaySubId", "==", sub.id)
      .limit(1)
      .get();
    if (!creatorSnap.empty) {
      const doc = creatorSnap.docs[0];
      await doc.ref.set(
        {
          platformPlanPastDue: false,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      console.log(`🔄 Razorpay platform plan renewal for ${doc.id}`);
      return NextResponse.json({ ok: true });
    }

    // Fan→creator
    const fanSubSnap = await adminDb
      .collection("subscriptions")
      .where("razorpaySubscriptionId", "==", sub.id)
      .limit(1)
      .get();
    if (!fanSubSnap.empty) {
      await fanSubSnap.docs[0].ref.update({
        status: "active",
        lastPaymentFailedAt: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`🔄 Razorpay fan subscription renewal ${sub.id}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. payment.failed — Card declined / mandate revoked
  // ─────────────────────────────────────────────────────────────────────────
  if (eventType === "payment.failed") {
    const payment = payload.payload.payment.entity;
    const subId = payment.subscription_id ?? null;
    if (!subId) return NextResponse.json({ ok: true });

    const creatorSnap = await adminDb
      .collection("users")
      .where("platformPlanRazorpaySubId", "==", subId)
      .limit(1)
      .get();
    if (!creatorSnap.empty) {
      await creatorSnap.docs[0].ref.set(
        {
          platformPlanPastDue: true,
          platformPlanLastPaymentFailedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      console.log(`⚠️  Razorpay platform plan payment failed for ${creatorSnap.docs[0].id}`);
      return NextResponse.json({ ok: true });
    }

    const fanSubSnap = await adminDb
      .collection("subscriptions")
      .where("razorpaySubscriptionId", "==", subId)
      .limit(1)
      .get();
    if (!fanSubSnap.empty) {
      await fanSubSnap.docs[0].ref.update({
        status: "past_due",
        lastPaymentFailedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`⚠️  Razorpay fan subscription ${subId} marked past_due.`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. subscription.cancelled / subscription.halted — Sub terminated
  // ─────────────────────────────────────────────────────────────────────────
  if (eventType === "subscription.cancelled" || eventType === "subscription.halted") {
    const sub = payload.payload.subscription.entity;

    // Platform plan
    const creatorSnap = await adminDb
      .collection("users")
      .where("platformPlanRazorpaySubId", "==", sub.id)
      .limit(1)
      .get();
    if (!creatorSnap.empty) {
      await creatorSnap.docs[0].ref.set(
        {
          platformPlan:                 "free",
          platformPlanRazorpaySubId:    null,
          platformPlanGateway:          null,
          planCancelAtPeriodEnd:        false,
          planCurrentPeriodEnd:         null,
          updatedAt:                    FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      console.log(`⬇️  Creator ${creatorSnap.docs[0].id} downgraded to free (Razorpay sub ${eventType})`);
      return NextResponse.json({ ok: true });
    }

    // Fan → creator
    const fanSubSnap = await adminDb
      .collection("subscriptions")
      .where("razorpaySubscriptionId", "==", sub.id)
      .limit(1)
      .get();
    if (!fanSubSnap.empty) {
      await fanSubSnap.docs[0].ref.update({
        status: "cancelled",
        cancelledAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`⬇️  Razorpay fan sub ${sub.id} cancelled.`);
    }
  }

  return NextResponse.json({ ok: true });
}
