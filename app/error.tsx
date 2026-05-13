"use client";

// Next.js route-level error fallback. This kicks in when a server or client
// component throws during render anywhere under app/. The shell (sidebar,
// navbar) stays mounted so the user can navigate away — we just replace
// the failed subtree with a friendly card + auto-trigger the bug-report
// modal so the user can describe what went wrong before they refresh.

import { useEffect } from "react";
import { reportBug } from "@/lib/report-bug";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Auto-open the report modal. Don't block render — the modal shows on
    // top of the fallback card so the user gets both context and an exit.
    reportBug({ error, context: `route-error${error.digest ? ` digest=${error.digest}` : ""}` });
  }, [error]);

  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        fontFamily: "'Inter', sans-serif",
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
        <h1
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: "1.4rem",
            fontWeight: 800,
            color: "#1f2937",
            margin: "0 0 8px",
          }}
        >
          Something went wrong
        </h1>
        <p style={{ color: "#6b7280", fontSize: "0.92rem", margin: "0 0 22px", lineHeight: 1.6 }}>
          We hit an unexpected error and our team has been notified.
          You can try again — or contact{" "}
          <a href="mailto:contact@askexpert.ink" style={{ color: "#7c3aed" }}>
            contact@askexpert.ink
          </a>{" "}
          if it keeps happening.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => reset()}
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
            Try again
          </button>
          <button
            onClick={() => reportBug({ error, context: "manual-from-error-page" })}
            style={{
              padding: "10px 22px",
              background: "#fff",
              color: "#374151",
              border: "1.5px solid #e5e7eb",
              borderRadius: 99,
              fontWeight: 700,
              fontSize: "0.9rem",
              cursor: "pointer",
            }}
          >
            Report this
          </button>
        </div>
      </div>
    </div>
  );
}
