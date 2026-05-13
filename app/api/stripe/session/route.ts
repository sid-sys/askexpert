import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { adminDb, FieldValue } from "@/lib/firebase-admin";
import { sendAskerConfirmationEmail, sendNewQuestionEmail } from "@/lib/resend";
import { sendPushNotification } from "@/lib/notifications";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const meta = session.metadata ?? {};

    // ── Subscription fallback ────────────────────────────────────────────────
    // Mirror the webhook's subscription branch in case the webhook is delayed
    // when the fan lands on /fan-dashboard. Idempotent: only writes if no doc
    // already exists for this Stripe subscription.
    if (session.mode === "subscription" && session.payment_status === "paid") {
      const stripeSubscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
      if (stripeSubscriptionId) {
        const existing = await adminDb
          .collection("subscriptions")
          .where("stripeSubscriptionId", "==", stripeSubscriptionId)
          .limit(1)
          .get();
        if (existing.empty) {
          const stripeCustomerId =
            typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
          const creatorSnap = await adminDb.collection("users").doc(meta.creatorId).get();
          const creatorData = creatorSnap.data() ?? {};
          await adminDb.collection("subscriptions").add({
            creatorId: meta.creatorId,
            creatorName: meta.creatorName || creatorData.displayName || "Creator",
            creatorUsername: creatorData.username || null,
            followerId: meta.followerUid || null,
            followerEmail: meta.followerEmail,
            followerName: meta.followerName || null,
            status: "active",
            pricePerMonth: parseInt(meta.pricePaid ?? "0"),
            currency: meta.currency ?? "usd",
            stripeCustomerId,
            stripeSubscriptionId,
            stripeSessionId: session.id,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            cancelledAt: null,
          });
          if (meta.followerUid && stripeCustomerId) {
            await adminDb.collection("users").doc(meta.followerUid).set(
              { stripeCustomerId, updatedAt: FieldValue.serverTimestamp() },
              { merge: true }
            );
          }

          // Count the subscription payment toward creator earnings + pending payouts.
          // Same cumulative split as the webhook: gross + net + platform fee
          // accumulated at the fee tier active at payment time.
          const grossCents = parseInt(meta.pricePaid ?? "0");
          if (grossCents > 0) {
            const subFeePct  = parseFloat(meta.feePercent ?? "15");
            const subFeeCts  = Math.round(grossCents * (subFeePct / 100));
            const subNetCts  = grossCents - subFeeCts;
            await adminDb.collection("users").doc(meta.creatorId).set(
              {
                totalEarnings:           FieldValue.increment(grossCents),
                totalCreatorNet:         FieldValue.increment(subNetCts),
                totalPlatformFee:        FieldValue.increment(subFeeCts),
                subscriptionNetEarnings: FieldValue.increment(subNetCts),
                updatedAt:               FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
            const payoutMethod = (creatorData.payoutMethod ?? "manual_bank") as string;
            if (payoutMethod === "manual_bank") {
              const feePercent = parseFloat(meta.feePercent ?? "15");
              const feeCents = Math.round(grossCents * (feePercent / 100));
              const creatorNetCents = grossCents - feeCents;
              await adminDb.collection("pendingPayouts").add({
                creatorId: meta.creatorId,
                creatorName: creatorData.displayName ?? meta.creatorName ?? "",
                creatorEmail: creatorData.email ?? "",
                amount: creatorNetCents,
                platformFeeAmount: feeCents,
                totalPaid: grossCents,
                currency: meta.currency ?? "usd",
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
              await adminDb.collection("users").doc(meta.creatorId).set(
                {
                  pendingPayoutBalance: FieldValue.increment(creatorNetCents),
                  updatedAt: FieldValue.serverTimestamp(),
                },
                { merge: true }
              );
            }
          }
        }
      }

      return NextResponse.json({
        creatorName: meta.creatorName ?? "Your Expert",
        followerEmail: meta.followerEmail ?? "",
        mode: "subscription",
      });
    }

    // ── FALLBACK SYNC ────────────────────────────────────────────────────────
    // If the session is paid but the question doesn't exist in Firestore,
    // we create it now. This handles cases where webhooks are delayed or fail.
    if (session.payment_status === "paid" && meta.questionId) {
      const qRef = adminDb.collection("questions").doc(meta.questionId);
      const qSnap = await qRef.get();
      const qData = qSnap.data();

      // Trigger if question doesn't exist OR it exists but notifications haven't been sent
      if (!qSnap.exists || !qData?.notificationsSent) {
        console.log(`🔄 Fallback Sync: Processing question ${meta.questionId} (exists: ${qSnap.exists})`);
        
        const {
          questionId, creatorId, creatorName, followerEmail,
          content, pricePaid, expiresAt,
          payoutMethod, feePercent, currency,
        } = meta as Record<string, string>;

        // Extract attachment URLs from metadata (att0, att1, etc.)
        const attachmentUrls: string[] = [];
        for (let i = 0; i < 5; i++) {
          const att = meta[`att${i}`];
          if (att) attachmentUrls.push(att);
        }

        if (!qSnap.exists) {
          await qRef.set({
            id:                    questionId,
            content,
            response:              null,
            status:                "PENDING",
            pricePaid:             parseInt(pricePaid),
            followerEmail,
            creatorId,
            stripePaymentIntentId: session.payment_intent || session.subscription || "",
            stripeChargeId:        null,
            stripeSessionId:       session.id,
            createdAt:             FieldValue.serverTimestamp(),
            updatedAt:             FieldValue.serverTimestamp(),
            answeredAt:            null,
            expiresAt:             new Date(expiresAt),
            payoutMethod:          payoutMethod ?? "manual_bank",
            notificationsSent:     false, // Will set to true below
            attachmentUrls,
          });

          // Also increment creator total earnings + net + platform fee
          // (computed at the fee tier active at payment time so the cached
          // totals stay correct across plan upgrades).
          {
            const grossAtPay = parseInt(pricePaid);
            const feePctAtPay = parseFloat(feePercent ?? "15");
            const feeAtPay = Math.round(grossAtPay * (feePctAtPay / 100));
            const netAtPay = grossAtPay - feeAtPay;
            await adminDb.collection("users").doc(creatorId).set(
              {
                totalEarnings:      FieldValue.increment(grossAtPay),
                totalCreatorNet:    FieldValue.increment(netAtPay),
                totalPlatformFee:   FieldValue.increment(feeAtPay),
                oneTimeNetEarnings: FieldValue.increment(netAtPay),
                updatedAt:          FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          }

          // If manual bank, add to pending payouts
          if (payoutMethod === "manual_bank") {
            const grossCents = parseInt(pricePaid);
            const feeCents   = Math.round(grossCents * (parseFloat(feePercent ?? "15") / 100));
            const creatorNet = grossCents - feeCents;

            await adminDb.collection("pendingPayouts").add({
              creatorId,
              creatorName:     creatorName ?? "",
              creatorEmail:    followerEmail, // Best effort
              amount:          creatorNet,
              platformFeeAmount: feeCents,
              totalPaid:       grossCents,
              currency:        currency ?? "usd",
              questionId,
              paymentType:     "per_question",
              status:          "pending",
              stripeSessionId: session.id,
              createdAt:       FieldValue.serverTimestamp(),
              updatedAt:       FieldValue.serverTimestamp(),
            });
            await adminDb.collection("users").doc(creatorId).set(
              { 
                pendingPayoutBalance: FieldValue.increment(creatorNet),
                updatedAt: FieldValue.serverTimestamp()
              },
              { merge: true }
            );
          }
        }

        // ── 📧 Trigger Notifications ─────────────────────────────────────────
        console.log(`📣 Triggering notifications for question ${meta.questionId}`);

        try {
          const creatorSnap = await adminDb.collection("users").doc(meta.creatorId).get();
          const creatorData = creatorSnap.data();

          // 1. Confirmation email to asker
          await sendAskerConfirmationEmail({
            to:          meta.followerEmail,
            creatorName: meta.creatorName ?? "your expert",
            question:    meta.content      ?? "",
            price:       parseInt(meta.pricePaid ?? "0"),
            expiresAt:   meta.expiresAt,
            currency:    meta.currency     ?? "usd",
            responseTimeHours: creatorData?.responseTimeHours || 72,
          });

          // 2. Notification email to creator
          if (creatorData?.email) {
            await sendNewQuestionEmail({
              to: creatorData.email,
              creatorName: creatorData.displayName || meta.creatorName || "Creator",
              question: meta.content || "",
              askerEmail: meta.followerEmail,
              askerName: meta.followerName,
              price: parseInt(meta.pricePaid ?? "0"),
              category: meta.category,
              requestedReplyFormat: meta.requestedReplyFormat,
              dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard`,
              responseTimeHours: creatorData?.responseTimeHours || 72,
              attachmentUrls: qData?.attachmentUrls || attachmentUrls,
            });
          }

          // 3. Push notification to creator
          await sendPushNotification({
            uid:   meta.creatorId,
            title: `💰 New question from ${meta.followerName?.trim() || "a fan"}`,
            body:  `"${(meta.content ?? "").slice(0, 80)}..."`,
            link:  "/questions",
          });

          // Mark as sent so we don't repeat on refresh
          await qRef.update({ notificationsSent: true });
          console.log(`✅ Notifications marked as sent for question ${meta.questionId}`);

        } catch (err: any) {
          console.error("⚠️ Fallback notification partially failed:", err.message);
          // We don't mark notificationsSent as true here, so it can retry on next visit
        }
      }
    }

    // Only expose fields the asker needs — never expose creator email
    return NextResponse.json({
      creatorName:  meta.creatorName  ?? "Your Expert",
      content:      meta.content      ?? "",
      pricePaid:    meta.pricePaid    ?? "0",
      currency:     meta.currency     ?? "usd",
      expiresAt:    meta.expiresAt    ?? null,
      followerEmail: meta.followerEmail ?? "",
      responseTimeHours: meta.responseTimeHours ? parseInt(meta.responseTimeHours) : 72,
    });
  } catch (err: any) {
    console.error("❌ Session retrieval error:", err.message);
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
}
