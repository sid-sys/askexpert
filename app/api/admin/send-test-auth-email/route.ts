import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { Resend } from "resend";

// POST /api/admin/send-test-auth-email
// Admin-only test harness for the Firebase auth email templates we just
// customised. Firebase Admin SDK can GENERATE the verify / reset links
// (admin.auth().generate*Link()) but doesn't send the emails itself —
// the actual send is normally handled by Firebase's email provider when
// the client SDK is used. To exercise the new branded action URL
// (https://askexpert.ink/auth/action) without standing up a fresh user
// signup, this route generates the link and wraps it in a Resend email
// that mimics Firebase's body.
//
// Body: { type: "verify" | "reset", email: string }
//
// Auth: caller must have userProfile.isAdmin === true. Pass Firebase ID
// token in `Authorization: Bearer <token>`.
//
// NOTE: this is a dev / staging helper. Production users still receive
// Firebase's own branded email — we don't intercept that pipeline.
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      // Allow unauthenticated dev calls only when ADMIN_SECRET matches.
      // Lets us trigger this from a curl during initial setup.
      const body = await req.clone().json().catch(() => ({}));
      if (!process.env.ADMIN_SECRET || body.adminSecret !== process.env.ADMIN_SECRET) {
        return NextResponse.json({ error: "Missing token or invalid admin secret" }, { status: 401 });
      }
    } else {
      try {
        const decoded = await adminAuth.verifyIdToken(token);
        const callerSnap = await adminDb.collection("users").doc(decoded.uid).get();
        if (!callerSnap.exists || !callerSnap.data()?.isAdmin) {
          return NextResponse.json({ error: "Admin only" }, { status: 403 });
        }
      } catch {
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });
      }
    }

    const { type, email } = (await req.json()) as { type: "verify" | "reset"; email: string };
    if (!type || !email) {
      return NextResponse.json({ error: "Missing type or email" }, { status: 400 });
    }

    // Build action-code settings so the generated link routes through our
    // custom handler page at /auth/action. continueUrl is where the user
    // ends up after the action completes; the handler navigates there on
    // success.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://askexpert.ink";
    const actionCodeSettings = {
      url: `${appUrl}/dashboard`,
      handleCodeInApp: false,
    };

    let actionLink: string;
    let subject: string;
    let body: string;

    if (type === "verify") {
      actionLink = await adminAuth.generateEmailVerificationLink(email, actionCodeSettings);
      subject = "Verify your email for AskExpert";
      body = `
        <p>Hello,</p>
        <p>Click the link below to verify your email address for AskExpert:</p>
        <p><a href="${actionLink}" style="color:#7c3aed;font-weight:700;">Verify my email →</a></p>
        <p>If the button doesn't work, paste this URL in your browser:</p>
        <p style="word-break:break-all;color:#6b7280;font-size:0.85rem;">${actionLink}</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
        <p>— The AskExpert Team</p>
      `;
    } else if (type === "reset") {
      actionLink = await adminAuth.generatePasswordResetLink(email, actionCodeSettings);
      subject = "Reset your AskExpert password";
      body = `
        <p>Hello,</p>
        <p>You (or someone with access to your email) requested a password reset for your AskExpert account.</p>
        <p><a href="${actionLink}" style="color:#7c3aed;font-weight:700;">Reset my password →</a></p>
        <p>If the button doesn't work, paste this URL in your browser:</p>
        <p style="word-break:break-all;color:#6b7280;font-size:0.85rem;">${actionLink}</p>
        <p>If you didn't request this, you can safely ignore this email — your password will not change.</p>
        <p>— The AskExpert Team</p>
      `;
    } else {
      return NextResponse.json({ error: `Unsupported type: ${type}` }, { status: 400 });
    }

    // Send via Resend so we don't depend on Firebase's email pipeline
    // being fully verified yet (DNS records may still be propagating).
    const resend = new Resend(process.env.RESEND_API_KEY!);
    // Use the same verified sender lib/resend.ts uses everywhere else,
    // not a new subdomain that isn't on file with Resend.
    const from = process.env.RESEND_FROM || "AskExpert <contact@askexpert.ink>";
    const sendRes = await resend.emails.send({
      from,
      to: email,
      subject,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937;line-height:1.6;">${body}</div>`,
    });
    if (sendRes.error) {
      return NextResponse.json({ error: `Send failed: ${sendRes.error.message}` }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      type,
      to: email,
      actionLink,
      resendId: sendRes.data?.id,
    });
  } catch (err: any) {
    console.error("[admin/send-test-auth-email] error:", err);
    return NextResponse.json({ error: err.message || "Send failed" }, { status: 500 });
  }
}
