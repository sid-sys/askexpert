"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

// /auth/action — landing for Firebase Auth email links.
//
// Firebase's email templates have an "Action URL" set to
// https://askexpert.ink/auth/action so every verify-email / password-reset
// / email-change / 2FA-removal link the user clicks lands here. The page
// reads ?mode=&oobCode= from the URL and calls the appropriate Firebase
// client SDK function to actually complete the action.
//
// The page is intentionally a single client component — no server work
// needed because the oobCode is consumed entirely by the JS SDK against
// Firebase Auth's REST API.

type Status =
  | { kind: "loading" }
  | { kind: "needs-password"; email: string }
  | { kind: "success"; message: string; ctaHref: string; ctaLabel: string }
  | { kind: "error"; message: string };

function ActionInner() {
  const params = useSearchParams();
  const router = useRouter();
  const mode    = params.get("mode") || "";
  const oobCode = params.get("oobCode") || "";

  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [newPassword, setNewPassword] = useState("");
  const [confirmPw, setConfirmPw]     = useState("");
  const [submitting, setSubmitting]   = useState(false);

  useEffect(() => {
    if (!oobCode || !mode) {
      setStatus({ kind: "error", message: "This link is missing required parameters. Re-request the email." });
      return;
    }

    (async () => {
      try {
        if (mode === "verifyEmail" || mode === "verifyAndChangeEmail") {
          await applyActionCode(auth, oobCode);
          setStatus({
            kind: "success",
            message: mode === "verifyAndChangeEmail"
              ? "Email change confirmed. You can now sign in with your new address."
              : "Your email is verified. Welcome to AskExpert! 🎉",
            ctaHref: "/dashboard",
            ctaLabel: "Go to dashboard →",
          });
        } else if (mode === "resetPassword") {
          // Two-step flow: verify the code first to get the user's email,
          // then render the password form. The actual reset happens in
          // performPasswordReset() below.
          const email = await verifyPasswordResetCode(auth, oobCode);
          setStatus({ kind: "needs-password", email });
        } else if (mode === "recoverEmail") {
          // Undo an email change. checkActionCode returns the original email
          // so we can tell the user what we're reverting to.
          const info = await checkActionCode(auth, oobCode);
          await applyActionCode(auth, oobCode);
          const previousEmail = (info.data as any)?.email || "your previous address";
          setStatus({
            kind: "success",
            message: `Your email has been restored to ${previousEmail}. We also recommend resetting your password as a precaution.`,
            ctaHref: "/auth?mode=signin",
            ctaLabel: "Sign in →",
          });
        } else if (mode === "revertSecondFactorAddition") {
          await applyActionCode(auth, oobCode);
          setStatus({
            kind: "success",
            message: "The 2-step verification factor has been removed.",
            ctaHref: "/dashboard",
            ctaLabel: "Go to dashboard →",
          });
        } else {
          setStatus({ kind: "error", message: `Unsupported action: ${mode}` });
        }
      } catch (err: any) {
        const code = err?.code || "";
        const friendly =
          code === "auth/expired-action-code" ? "This link has expired. Request a new one."
          : code === "auth/invalid-action-code" ? "This link is invalid or has already been used."
          : code === "auth/user-disabled" ? "This account has been disabled. Contact support."
          : code === "auth/user-not-found" ? "We couldn't find an account for this link."
          : (err?.message || "Something went wrong. Try requesting a new email.");
        setStatus({ kind: "error", message: friendly });
      }
    })();
  }, [mode, oobCode]);

  const performPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setStatus({ kind: "needs-password", email: (status as any).email });
      alert("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPw) {
      alert("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setStatus({
        kind: "success",
        message: "Your password is updated. You can sign in with the new password.",
        ctaHref: "/auth?mode=signin",
        ctaLabel: "Sign in →",
      });
    } catch (err: any) {
      const code = err?.code || "";
      const friendly =
        code === "auth/expired-action-code" ? "This reset link has expired. Request a new one."
        : code === "auth/invalid-action-code" ? "This reset link is invalid or has already been used."
        : code === "auth/weak-password" ? "Password is too weak. Choose at least 8 characters with a mix of letters and numbers."
        : (err?.message || "Could not reset password. Try again.");
      setStatus({ kind: "error", message: friendly });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "32px 16px", background: "#f8f7ff" }}>
      <div style={{
        maxWidth: 460, width: "100%",
        background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20,
        padding: "32px 28px", boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
      }}>
        {status.kind === "loading" && (
          <>
            <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "1.4rem", fontWeight: 800, color: "#1f2937", margin: "0 0 8px" }}>
              Verifying…
            </h1>
            <p style={{ color: "#6b7280", fontSize: "0.95rem" }}>One moment while we process the link from your email.</p>
          </>
        )}

        {status.kind === "needs-password" && (
          <form onSubmit={performPasswordReset}>
            <div style={{ fontSize: "2.2rem", marginBottom: 12 }}>🔐</div>
            <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "1.4rem", fontWeight: 800, color: "#1f2937", margin: "0 0 8px" }}>
              Set a new password
            </h1>
            <p style={{ color: "#6b7280", fontSize: "0.9rem", marginBottom: 20 }}>
              For <strong>{status.email}</strong>
            </p>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
              autoFocus
              style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #e5e7eb", borderRadius: 10, marginBottom: 14, fontSize: "0.95rem", boxSizing: "border-box", fontFamily: "inherit" }}
            />
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Confirm password</label>
            <input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="Repeat new password"
              required
              minLength={8}
              style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #e5e7eb", borderRadius: 10, marginBottom: 20, fontSize: "0.95rem", boxSizing: "border-box", fontFamily: "inherit" }}
            />
            <button
              type="submit"
              disabled={submitting}
              style={{
                width: "100%", padding: "13px 0",
                background: submitting ? "#9ca3af" : "linear-gradient(135deg, #7c3aed, #a855f7)",
                color: "#fff", border: "none", borderRadius: 12,
                fontWeight: 800, fontSize: "0.95rem",
                cursor: submitting ? "wait" : "pointer",
              }}
            >
              {submitting ? "Updating…" : "Update password"}
            </button>
          </form>
        )}

        {status.kind === "success" && (
          <>
            <div style={{ fontSize: "2.4rem", marginBottom: 12 }}>✅</div>
            <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "1.4rem", fontWeight: 800, color: "#1f2937", margin: "0 0 8px" }}>
              All set
            </h1>
            <p style={{ color: "#4b5563", fontSize: "0.95rem", lineHeight: 1.55, marginBottom: 20 }}>
              {status.message}
            </p>
            <button
              onClick={() => router.push(status.ctaHref)}
              style={{
                width: "100%", padding: "13px 0",
                background: "linear-gradient(135deg, #7c3aed, #a855f7)",
                color: "#fff", border: "none", borderRadius: 12,
                fontWeight: 800, fontSize: "0.95rem", cursor: "pointer",
              }}
            >
              {status.ctaLabel}
            </button>
          </>
        )}

        {status.kind === "error" && (
          <>
            <div style={{ fontSize: "2.4rem", marginBottom: 12 }}>⚠️</div>
            <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "1.4rem", fontWeight: 800, color: "#1f2937", margin: "0 0 8px" }}>
              Couldn't complete this
            </h1>
            <p style={{ color: "#4b5563", fontSize: "0.95rem", lineHeight: 1.55, marginBottom: 20 }}>
              {status.message}
            </p>
            <button
              onClick={() => router.push("/auth")}
              style={{
                width: "100%", padding: "13px 0",
                background: "#6b7280", color: "#fff", border: "none", borderRadius: 12,
                fontWeight: 800, fontSize: "0.95rem", cursor: "pointer",
              }}
            >
              Back to sign in
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuthActionPage() {
  // useSearchParams must be inside a Suspense boundary in app router.
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#6b7280" }}>Loading…</div>
    }>
      <ActionInner />
    </Suspense>
  );
}
