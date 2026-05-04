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

    // Fetch creator name
    const creatorSnap = await adminDb.collection("users").doc(creatorId).get();
    const creatorName = creatorSnap.data()?.displayName || "Your Expert";

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
