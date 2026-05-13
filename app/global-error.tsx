"use client";

// Root-level error fallback. This only renders when the failure happens
// *outside* a regular route — i.e. inside the root layout itself, or
// before the layout could mount. We can't rely on Sweetalert (the rest of
// the tree isn't mounted), so we keep the UI completely standalone.
//
// For normal in-route render errors see app/error.tsx, which sits inside
// the shell and auto-opens the friendly bug-report modal.

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    // Still report to Sentry — but skip Sentry's built-in dialog. We give
    // the user a branded card with a mailto: instead so they don't see
    // Sentry chrome they don't recognise.
    try { Sentry.captureException(error); } catch { /* ignore */ }
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#fafafa",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Inter', system-ui, sans-serif",
          color: "#1f2937",
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 460,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 18,
            padding: "32px 28px",
            textAlign: "center",
            boxShadow: "0 4px 24px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ fontSize: "2.4rem", marginBottom: 12 }}>😣</div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 800, margin: "0 0 8px" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#6b7280", fontSize: "0.92rem", lineHeight: 1.6, margin: "0 0 22px" }}>
            We hit a problem loading the app. Our team has been notified.
            If this keeps happening, please email{" "}
            <a href="mailto:contact@askexpert.ink" style={{ color: "#7c3aed" }}>
              contact@askexpert.ink
            </a>
            {error.digest && (
              <>
                {" "}with reference <code style={{ background: "#f3f4f6", padding: "1px 6px", borderRadius: 4 }}>{error.digest}</code>
              </>
            )}
            .
          </p>
          <button
            onClick={() => location.reload()}
            style={{
              padding: "10px 22px",
              background: "linear-gradient(135deg, #7c3aed, #a855f7)",
              color: "#fff",
              border: "none",
              borderRadius: 99,
              fontWeight: 700,
              fontSize: "0.9rem",
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(124,58,237,0.3)",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
