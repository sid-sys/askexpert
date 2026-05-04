import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { adminDb, FieldValue } from "@/lib/firebase-admin";
import { sendPushNotification } from "@/lib/notifications";
import { sendAskerConfirmationEmail, sendNewQuestionEmail } from "@/lib/resend";


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

    try {
      const {
        questionId, creatorId, creatorName, followerEmail, followerName,
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

      // ── Increment creator gross earnings ──────────────────────────────────
      console.log(`[Webhook] Step 2: Incrementing creator earnings for ${creatorId}...`);
      await adminDb.collection("users").doc(creatorId).set(
        { 
          totalEarnings: FieldValue.increment(parseInt(pricePaid)),
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      // ── If manual bank: write pendingPayout record ────────────────────────
      if (payoutMethod === "manual_bank") {
        console.log(`[Webhook] Step 3: Creating pendingPayout for ${creatorName}...`);

        const grossCents     = parseInt(pricePaid);
        const feeCents       = Math.round(grossCents * (parseFloat(feePercent ?? "15") / 100));
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
              title: "💰 New Question Paid!",
              body:  `Someone paid to ask: "${(content ?? "").slice(0, 80)}..."`,
              link:  "/dashboard",
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
      await adminDb.collection("users").doc(uid).set(
        {
          platformPlan:            plan,
          platformPlanStripeSubId: sub.id,
          stripeCustomerId:        typeof sub.customer === "string" ? sub.customer : sub.customer.id,
          updatedAt:               FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      console.log(`🚀 Creator ${uid} upgraded to plan: ${plan}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. customer.subscription.deleted — Creator cancelled platform plan
  // ─────────────────────────────────────────────────────────────────────────
  if (event.type === "customer.subscription.deleted") {
    const sub  = event.data.object as Stripe.Subscription;
    const meta = sub.metadata;

    if (!meta?.uid) return NextResponse.json({ ok: true });

    await adminDb.collection("users").doc(meta.uid).set(
      { 
        platformPlan: "free", 
        platformPlanStripeSubId: null,
        updatedAt: FieldValue.serverTimestamp() 
      },
      { merge: true }
    );
    console.log(`⬇️  Creator ${meta.uid} downgraded to free (subscription cancelled)`);
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
