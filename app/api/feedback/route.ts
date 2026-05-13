import { NextResponse } from "next/server";
import { adminDb, FieldValue } from "@/lib/firebase-admin";
import { sendFeedbackEmail } from "@/lib/resend";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      type,
      message,
      email,
      name,
      rating,
      url,
      // Structured fields used by reportBug() for bug reports — let the
      // admin panel surface them as columns instead of grepping the
      // message blob.
      userUid,
      context,
      userAgent,
      errorMessage,
      errorName,
      errorStack,
      clientTimestamp,
    } = body;

    if (!type || !message) {
      return NextResponse.json(
        { error: "Type and message are required" },
        { status: 400 }
      );
    }

    // If we have a uid but no email, look the user doc up so the admin
    // panel can still attribute the report. Best-effort — never block the
    // write on this.
    let resolvedEmail = email || "";
    let resolvedName  = name  || "";
    if (userUid && (!resolvedEmail || !resolvedName)) {
      try {
        const snap = await adminDb.collection("users").doc(userUid).get();
        const d = snap.data() as any;
        if (d) {
          resolvedEmail ||= d.email       || "";
          resolvedName  ||= d.displayName || d.username || "";
        }
      } catch { /* ignore */ }
    }

    // 1. Save to Firestore
    await adminDb.collection("feedback").add({
      type,
      message,
      name:  resolvedName  || "Anonymous",
      email: resolvedEmail || "anonymous",
      rating: rating || 0,
      // Bug-report metadata. Stored as top-level fields so the admin panel
      // can render them without parsing.
      userUid:         userUid || null,
      url:             url     || "",
      context:         context || null,
      userAgent:       userAgent || "",
      errorMessage:    errorMessage || "",
      errorName:       errorName    || "",
      errorStack:      errorStack   || "",
      clientTimestamp: clientTimestamp || null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      status: "pending",
    });

    // 2. Send Email Notification
    await sendFeedbackEmail({ type, message, email: resolvedEmail, name: resolvedName, rating, url });

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
