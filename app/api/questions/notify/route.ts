import { NextRequest, NextResponse } from "next/server";
import { adminDb, FieldValue } from "@/lib/firebase-admin";
import { sendNewQuestionEmail } from "@/lib/resend";

export async function POST(req: NextRequest) {
  try {
    const { questionId } = await req.json();

    if (!questionId) {
      return NextResponse.json({ error: "Missing questionId" }, { status: 400 });
    }

    const questionRef = adminDb.collection("questions").doc(questionId);
    const questionSnap = await questionRef.get();

    if (!questionSnap.exists) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    const question = questionSnap.data()!;

    // Mark question as new (unseen by creator)
    await questionRef.update({ 
      isNew: true,
      updatedAt: FieldValue.serverTimestamp()
    });

    // Fetch creator details
    const creatorSnap = await adminDb.collection("users").doc(question.creatorId).get();
    const creator = creatorSnap.data();

    if (!creator?.email) {
      console.warn(`Creator ${question.creatorId} has no email — skipping notification`);
      return NextResponse.json({ ok: true, warned: "no_creator_email" });
    }

    // Send email to creator
    await sendNewQuestionEmail({
      to: creator.email,
      creatorName: creator.displayName || "Creator",
      question: question.content,
      askerEmail: question.followerEmail,
      price: question.pricePaid,
      category: question.category,
      requestedReplyFormat: question.requestedReplyFormat,
      dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard`,
      responseTimeHours: creator.responseTimeHours || 72,
    });

    console.log(`📬 Creator ${question.creatorId} notified of question ${questionId}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Notify error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
