"use client";

import { useEffect } from "react";
import { reportBug } from "@/lib/report-bug";

// Runtime error funnel. We want:
//   1. Known-harmless errors (Next.js fetch aborts, Firebase offline blips,
//      ResizeObserver warnings, browser-injected garbage) → swallowed quietly.
//   2. Any other uncaught error or unhandled promise rejection → routed to
//      reportBug() so the user sees a friendly modal instead of nothing
//      (or, worse, Next.js's dev-only red overlay leaking to production).
//
// React render errors are handled separately by app/error.tsx + the
// GlobalErrorBoundary class component — they never reach window 'error'.

function isIgnorable(reason: any): boolean {
  if (!reason) return true;
  const name: string = reason?.name ?? "";
  const message: string = reason?.message ?? String(reason);

  if (name === "AbortError" || message.includes("AbortError")) return true;
  if (message.includes("client is offline")) return true;
  // Chrome's harmless layout warning that floods sessions on some pages.
  if (message.includes("ResizeObserver loop")) return true;
  // Extensions / browser noise that bubbles through window.onerror but isn't ours.
  if (message.includes("Script error.")) return true;
  // Stripe.js cancellations on route changes.
  if (message.includes("Cancelled by user") || message.includes("payment_intent_unexpected_state")) return true;
  return false;
}

export default function ErrorSuppressor() {
  useEffect(() => {
    const onReject = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (isIgnorable(reason)) {
        event.preventDefault();
        return;
      }
      // Don't preventDefault — we still want it in logs/Sentry — but show
      // a friendly modal instead of leaving the user staring at a half-
      // broken page.
      reportBug({ error: reason, context: "unhandledrejection" });
    };

    const onError = (event: ErrorEvent) => {
      const err = event.error || event.message;
      if (isIgnorable(event.error || { message: event.message })) return;
      reportBug({ error: err, context: "window.error" });
    };

    window.addEventListener("unhandledrejection", onReject);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onReject);
      window.removeEventListener("error", onError);
    };
  }, []);

  return null;
}
