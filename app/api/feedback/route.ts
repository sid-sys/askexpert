import { NextResponse } from "next/server";
import { adminDb, FieldValue } from "@/lib/firebase-admin";
import { sendFeedbackEmail } from "@/lib/resend";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { type, message, email, name, rating } = body;

    if (!type || !message) {
      return NextResponse.json(
        { error: "Type and message are required" },
        { status: 400 }
      );
    }

    // 1. Save to Firestore
    await adminDb.collection("feedback").add({
      type,
      message,
      name: name || "Anonymous",
      email: email || "anonymous",
      rating: rating || 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      status: "pending",
    });

    // 2. Send Email Notification
    await sendFeedbackEmail({ type, message, email, name, rating, url: body.url });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("CRITICAL: Feedback API Failure", {
      message: error.message,
      stack: error.stack,
      cause: error.cause
    });
    
    return NextResponse.json(
      { error: `Submission failed: ${error.message || "Internal Error"}` },
      { status: 500 }
    );
  }
}
