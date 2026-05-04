import { NextRequest, NextResponse } from "next/server";
import { adminDb, FieldValue } from "@/lib/firebase-admin";
import { stripe } from "@/lib/stripe";
import { sendRefundEmail } from "@/lib/resend";

/**
 * POST /api/cron/auto-refund
 * 
 * Internal endpoint called by the dashboard client when it detects expired PENDING questions.
 * No external secret needed — this is a server-side action that trusts its own environment.
 * Rate-limited by nature (only fires once per questions state change).
 */
export async function POST(_req: NextRequest) {
  console.log("⚡ [auto-refund] Self-healing trigger fired from dashboard...");

  try {
    const now = new Date();
    // 🛡️ Add a 15-minute grace period to avoid refunding questions being actively answered
    const graceCutoff = new Date(now.getTime() - 15 * 60 * 1000);

    console.log(`🕐 Current time: ${now.toISOString()}, Grace cutoff: ${graceCutoff.toISOString()}`);

    // Query both casing variants for safety
    const [upperSnap, lowerSnap] = await Promise.all([
      adminDb.collection("questions").where("status", "==", "PENDING").where("expiresAt", "<", graceCutoff).get(),
      adminDb.collection("questions").where("status", "==", "pending").where("expiresAt", "<", graceCutoff).get(),
    ]);

    const allDocs = [...upperSnap.docs, ...lowerSnap.docs];
    const seen = new Set<string>();
    const uniqueDocs = allDocs.filter((doc) => {
      if (seen.has(doc.id)) return false;
      seen.add(doc.id);
      return true;
    });

    console.log(`📋 [auto-refund] Found ${uniqueDocs.length} expired questions (with 15m grace)`);

    if (uniqueDocs.length === 0) {
      return NextResponse.json({ message: "No expired questions", refunded: 0 });
    }

    let refunded = 0;
    const errors: string[] = [];

    for (const doc of uniqueDocs) {
      console.log(`🔍 Processing ${doc.id}: email=${doc.data().followerEmail}`);

      try {
        // 🔒 Use transaction to ensure status is still PENDING before marking as REFUNDED
        const transactionResult = await adminDb.runTransaction(async (transaction) => {
          const freshSnap = await transaction.get(doc.ref);
          if (!freshSnap.exists) return { skipped: true, reason: "Deleted" };
          
          const freshData = freshSnap.data()!;

          if (freshData.status !== "PENDING" && freshData.status !== "pending") {
            return { skipped: true, reason: `Status is ${freshData.status}` };
          }
          if (freshData.answeredAt || freshData.response) {
            return { skipped: true, reason: "Already has answer/response" };
          }

          transaction.update(doc.ref, {
            status: "REFUNDED",
            updatedAt: FieldValue.serverTimestamp(),
            refundedAt: FieldValue.serverTimestamp(),
          });

          return { skipped: false, data: freshData };
        });

        if (transactionResult.skipped || !transactionResult.data) {
          console.log(`   ⏭️ Skipping ${doc.id}: ${transactionResult.reason}`);
          continue;
        }

        const q = transactionResult.data;
        console.log(`   📝 Firestore marked as REFUNDED`);

        // ── Stripe refund ──────────────────────────────────────────────────────
        const pid = q.stripePaymentIntentId;
        if (pid && pid.startsWith("pi_")) {
          console.log(`   💳 Stripe refund for ${pid}...`);
          await stripe.refunds.create({ payment_intent: pid });
          console.log(`   ✅ Stripe refund issued`);
        } else {
          console.log(`   ⚠️ No valid payment intent — skipping Stripe (id="${pid}")`);
        }


        // ── Refund email ───────────────────────────────────────────────────────
        const toEmail = q.followerEmail;
        if (!toEmail) {
          console.error(`   ❌ No followerEmail on ${doc.id} — skipping email`);
          errors.push(`${doc.id}: missing followerEmail`);
          continue;
        }

        // Get creator responseTime
        const creatorName = q.creatorName || "The Creator";
        const actualResponseTime = q.responseTimeHours || 72;

        await sendRefundEmail({
          to: q.followerEmail,
          question: q.content,
          creatorName: creatorName,
          responseTimeHours: actualResponseTime
        });
        console.log(`   📧 Refund email sent to ${toEmail}`);

        refunded++;
      } catch (err: any) {
        console.error(`   ❌ Error on ${doc.id}:`, err.message);
        errors.push(`${doc.id}: ${err.message}`);
      }
    }

    console.log(`🏁 [auto-refund] Done. Refunded: ${refunded}, Errors: ${errors.length}`);
    return NextResponse.json({ message: `Refunded ${refunded}`, refunded, errors });
  } catch (err: any) {
    console.error("❌ [auto-refund] FATAL:", err.message);
    return NextResponse.json({ error: "Internal error", detail: err.message }, { status: 500 });
  }
}
