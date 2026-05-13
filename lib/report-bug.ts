// Single entry point for surfacing unexpected errors to the user. Replaces
// the raw stack traces / Next.js red overlays / Sentry's default dialog
// with a friendly "Something went wrong — please tell us what happened"
// modal that posts to /api/feedback.
//
// Call this from:
//   - React error boundaries (componentDidCatch)
//   - Next.js app/error.tsx route fallbacks
//   - Window 'error' + 'unhandledrejection' listeners
//   - Any catch block that has nothing better to do with a thrown error
//
// Designed to be safely callable from anywhere, including code that itself
// might already be in an error state — every step is best-effort.

import Swal from "sweetalert2";
import { auth } from "@/lib/firebase";

type ReportInput = {
  error?: unknown;
  // Free-text label describing where the error came from, e.g. "profile-save",
  // "checkout", "ErrorBoundary". Surfaces in the email subject.
  context?: string;
};

// Module-level guard so a thundering herd of identical errors (e.g. a React
// re-render loop) doesn't open a dialog for every one. We re-arm after the
// modal closes.
let dialogOpen = false;

function errorToString(err: unknown): string {
  if (!err) return "(no error object)";
  if (err instanceof Error) {
    const parts = [err.name, err.message, err.stack].filter(Boolean);
    return parts.join("\n");
  }
  try { return JSON.stringify(err, null, 2); } catch { return String(err); }
}

async function postReport(body: Record<string, unknown>) {
  // Fire-and-forget: failures here must never throw back to the user.
  try {
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true, // best-effort send even if user navigates away
    });
  } catch { /* swallow */ }
}

export async function reportBug({ error, context }: ReportInput = {}): Promise<void> {
  if (typeof window === "undefined") return;
  if (dialogOpen) return;
  dialogOpen = true;

  const errorText  = errorToString(error);
  const url        = window.location.href;
  const userAgent  = navigator.userAgent;
  const timestamp  = new Date().toISOString();

  try {
    const { value: note, isConfirmed } = await Swal.fire({
      title: "Something went wrong",
      html: `
        <div style="text-align:left;font-size:0.9rem;line-height:1.55;color:#374151;">
          <p style="margin:0 0 12px;">
            We hit an unexpected error and couldn't finish what you were doing.
            Our team has been notified — and you can help us fix it faster.
          </p>
          <label style="display:block;font-size:0.78rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">
            What were you trying to do? (optional)
          </label>
          <textarea id="bug-note" rows="3"
            placeholder="I was on the payout tab, clicked Save, and..."
            style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:10px;font-family:inherit;font-size:0.88rem;resize:vertical;box-sizing:border-box;"></textarea>
          <p style="margin:12px 0 0;font-size:0.75rem;color:#9ca3af;">
            Need a hand? <a href="mailto:contact@askexpert.ink" style="color:#7c3aed;text-decoration:underline;">contact@askexpert.ink</a>
          </p>
        </div>
      `,
      icon: "error",
      iconColor: "#ef4444",
      showCancelButton: true,
      confirmButtonText: "Send report",
      cancelButtonText: "Close",
      confirmButtonColor: "#7c3aed",
      cancelButtonColor: "#9ca3af",
      reverseButtons: true,
      focusConfirm: false,
      preConfirm: () => {
        const el = document.getElementById("bug-note") as HTMLTextAreaElement | null;
        return el?.value?.trim() || "";
      },
    });

    if (isConfirmed) {
      // Pull the signed-in user (if any) directly from the Firebase Auth
      // client. reportBug is callable from non-React code paths, so we
      // can't rely on React context. Anonymous visitors still send a
      // report — they just show up as "Anonymous" in the admin panel.
      const currentUser = auth.currentUser;
      const userUid     = currentUser?.uid   || null;
      const userEmail   = currentUser?.email || "";
      const userName    = currentUser?.displayName || "";

      await postReport({
        type: "bug",
        // The free-text note the user typed, on its own — server stores it
        // verbatim as the primary "what they said" field.
        message: note || "(no user note provided)",
        // Structured fields the admin panel reads to populate the report
        // card without parsing the message blob.
        userUid,
        email: userEmail,
        name:  userName,
        url,
        context: context || null,
        userAgent,
        errorMessage: error instanceof Error ? error.message : String(error ?? ""),
        errorName:    error instanceof Error ? error.name    : "",
        errorStack:   error instanceof Error ? (error.stack || "") : "",
        clientTimestamp: timestamp,
      });
      // Quiet confirmation; no auto-dismiss alarm since they already saw
      // the error dialog.
      await Swal.fire({
        title: "Report sent",
        text: "Thanks — we'll take a look.",
        icon: "success",
        timer: 2200,
        showConfirmButton: false,
      });
    }
  } finally {
    dialogOpen = false;
  }
}
