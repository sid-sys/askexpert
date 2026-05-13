import { NextRequest, NextResponse } from "next/server";
import { adminDb, FieldValue } from "@/lib/firebase-admin";
import { stripe } from "@/lib/stripe";
import { sendRefundEmail } from "@/lib/resend";
import { resolveResponseTimeHours } from "@/lib/refund-helpers";

export async function POST(req: NextRequest) {
  // ✅ Verify cron secret
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("🔁 [cron/refund-expired] Starting cron job...");

  try {
    const now = new Date();
    // 🛡️ Add a 15-minute grace period (buffer) to avoid refunding questions that are being actively answered
    const graceCutoff = new Date(now.getTime() - 15 * 60 * 1000);

    console.log(`🕐 Current time: ${now.toISOString()}, Grace cutoff: ${graceCutoff.toISOString()}`);

    // Query for BOTH uppercase and lowercase "pending" status to handle data inconsistency
    const [upperSnap, lowerSnap] = await Promise.all([
      adminDb.collection("questions").where("status", "==", "PENDING").where("expiresAt", "<", graceCutoff).get(),
      adminDb.collection("questions").where("status", "==", "pending").where("expiresAt", "<", graceCutoff).get(),
    ]);

    const allDocs = [...upperSnap.docs, ...lowerSnap.docs];
    // De-duplicate by doc ID (in case both queries return the same doc)
    const seen = new Set<string>();
    const uniqueDocs = allDocs.filter(doc => {
      if (seen.has(doc.id)) return false;
      seen.add(doc.id);
      return true;
    });

    console.log(`📋 Found ${uniqueDocs.length} expired PENDING questions (with 15m grace)`);

    if (uniqueDocs.length === 0) {
      return NextResponse.json({ message: "No expired questions", count: 0 });
    }

    let refunded = 0;
    const errors: string[] = [];
    const skipped: string[] = [];

    for (const doc of uniqueDocs) {
      console.log(`\n🔍 Processing question ${doc.id}:`);

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

        if (transactionResult.skipped) {
          console.log(`   ⏭️ Skipping ${doc.id}: ${transactionResult.reason}`);
          skipped.push(`${doc.id} (${transactionResult.reason})`);
          continue;
        }

        const q = transactionResult.data!;
        console.log(`   📝 Firestore status → REFUNDED.`);

        const paymentIntentId = q.stripePaymentIntentId;

        // ── Stripe refund ───────────────────────────────────────────────────
        if (paymentIntentId && paymentIntentId.startsWith("pi_")) {
          console.log(`   💳 Issuing Stripe refund for ${paymentIntentId}...`);
          await stripe.refunds.create({ payment_intent: paymentIntentId });
          console.log(`   ✅ Stripe refund issued.`);
        } else {
          console.log(`   ⚠️ No valid paymentIntentId — skipping Stripe refund (id="${paymentIntentId}")`);
        }

        // ── Send refund email ───────────────────────────────────────────────
        const toEmail = q.followerEmail;
        if (!toEmail) {
          console.error(`   ❌ No followerEmail on question ${doc.id}! Skipping email.`);
          errors.push(`${doc.id} (missing followerEmail)`);
          continue;
        }

        console.log(`   📧 Sending refund email to ${toEmail}...`);
        const creatorName = q.creatorName || "The Creator";
        // Resolve the response-time window we'll surface in the email —
        // prefer what was captured on the question, then derive from the
        // expiry window, then look up the creator's current setting. Never
        // hardcode 72h.
        const actualResponseTime = await resolveResponseTimeHours(q, q.creatorId);

        const emailResult = await sendRefundEmail({
          to: toEmail,
          question: q.content,
          creatorName: creatorName,
          responseTimeHours: actualResponseTime
        });
        console.log(`   ✅ Refund email sent. Resend ID: ${(emailResult as any)?.data?.id || "unknown"}`);

        refunded++;
      } catch (err: any) {
        console.error(`   ❌ Failed to process question ${doc.id}:`, err.message);
        errors.push(`${doc.id}: ${err.message}`);
      }
    }

    console.log(`\n🏁 Cron job complete. Refunded: ${refunded}, Errors: ${errors.length}, Skipped: ${skipped.length}`);
    return NextResponse.json({
      message: `Refunded ${refunded} questions`,
      refunded,
      errors,
      skipped,
    });
  } catch (err: any) {
    console.error("❌ [cron/refund-expired] FATAL error:", err.message, err.stack);
    return NextResponse.json({ error: "Internal error", detail: err.message }, { status: 500 });
  }
}

// Allow manual GET trigger for testing (still requires the secret)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Delegate to POST handler
  return POST(req);
}
