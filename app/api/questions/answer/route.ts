import { NextRequest, NextResponse } from "next/server";
import { adminDb, FieldValue } from "@/lib/firebase-admin";
import { sendAnswerEmail } from "@/lib/resend";
import { AnswerType } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const {
      questionId,
      response,
      creatorId,
      answerType = "text" as AnswerType,
      answerUrl,
      answerAttachmentUrls,
    } = await req.json();

    if (!questionId || !response || !creatorId) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Block answers when the creator owes the platform a plan fee that we
    // couldn't deduct from their accrued earnings. Fans can still ask — only
    // outbound answers are gated. The /payout banner tells the creator what
    // to do.
    const creatorSnapEarly = await adminDb.collection("users").doc(creatorId).get();
    if (creatorSnapEarly.data()?.paymentDue) {
      return NextResponse.json(
        {
          error: "PAYMENT_DUE",
          message: "Resolve your outstanding plan fee in /upgrade before replying to new questions.",
          owedCents: creatorSnapEarly.data()?.paymentDueCents ?? 0,
        },
        { status: 402 },
      );
    }

    const questionRef = adminDb.collection("questions").doc(questionId);
    
    // 🔒 Use transaction to prevent race conditions with auto-refund cron
    const question = await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(questionRef);
      if (!snap.exists) throw new Error("NOT_FOUND");
      
      const q = snap.data()!;
      if (q.creatorId !== creatorId) throw new Error("UNAUTHORIZED");
      if (q.status !== "PENDING" && q.status !== "pending") throw new Error("ALREADY_PROCESSED");

      transaction.update(questionRef, {
        response,
        status: "ANSWERED",
        answeredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        answerType,
        ...(answerUrl ? { answerUrl } : {}),
        ...(answerAttachmentUrls ? { answerAttachmentUrls } : {}),
        isNew: false,
      });

      return q; // Return original data for email
    });

    // Re-use the creator snapshot we already fetched above (still fresh).
    const creatorName = creatorSnapEarly.data()?.displayName || "Your Expert";

    // ✉️ Email asker with answer
    await sendAnswerEmail({
      to: question.followerEmail,
      creatorName,
      question: question.content,
      answer: response,
      answerType,
      answerUrl,
      attachmentUrls: answerAttachmentUrls,
    });

    console.log(
      `✅ Question ${questionId} answered by creator ${creatorId} as [${answerType}]`
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (err.message === "ALREADY_PROCESSED") {
      return NextResponse.json(
        { error: "Question already answered or refunded" },
        { status: 400 }
      );
    }

    console.error("Answer error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
