"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import LiveTimer from "@/components/LiveTimer";
import { formatCurrency, formatDuration } from "@/lib/utils";

interface SessionData {
  creatorName: string;
  content: string;
  pricePaid: string;
  currency: string;
  expiresAt: string | null;
  followerEmail: string;
  responseTimeHours: number;
}


const steps = [
  { icon: "✉️", title: "Check your email", body: "Your answer will be delivered straight to your inbox." },
  { icon: "⏰", title: "Auto refund guarantee", body: "If the expert doesn't reply in time, you get a full automatic refund." },
  { icon: "🔒", title: "Your privacy is protected", body: "We never share your personal details with the creator." },
];

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId    = searchParams.get("session_id");

  const [session, setSession]   = useState<SessionData | null>(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!sessionId) { setLoading(false); return; }
    fetch(`/api/stripe/session?session_id=${sessionId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setSession(data); })
      .finally(() => setLoading(false));
  }, [sessionId]);

  const priceDisplay = session ? formatCurrency(parseInt(session.pricePaid), session.currency) : null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&family=Inter:wght@400;500;600&display=swap');
        .success-page { min-height:100vh; background:#fafafa; font-family:'Inter',sans-serif; }
        .success-header {
          padding:18px 5%;
          background:#fff;
          border-bottom:1px solid #e5e7eb;
          display:flex; align-items:center; justify-content:space-between;
        }
        .success-logo { display:flex; align-items:center; gap:10px; text-decoration:none; }
        .success-logo-icon {
          width:34px; height:34px; border-radius:10px;
          background:#7c3aed; color:#fff;
          display:grid; place-items:center;
          font-size:1rem; font-weight:900; font-family:'Outfit',sans-serif;
        }
        .success-logo-text { font-family:'Outfit',sans-serif; font-size:1.3rem; font-weight:800; color:#7c3aed; }
        .success-badge-label { font-size:0.8rem; color:#9ca3af; font-weight:500; }

        .success-main {
          max-width:600px; margin:0 auto;
          padding:52px 24px 64px;
          display:flex; flex-direction:column; gap:28px;
        }

        /* Hero */
        .success-hero { text-align:center; }
        .success-paid-pill {
          display:inline-flex; align-items:center; gap:7px;
          background:#f0fdf4; border:1.5px solid #a7f3d0;
          border-radius:99px; padding:7px 18px;
          color:#059669; font-size:0.83rem; font-weight:700;
          letter-spacing:0.04em; text-transform:uppercase; margin-bottom:20px;
        }
        .success-h1 {
          font-family:'Outfit',sans-serif;
          font-size:clamp(2rem,6vw,2.9rem);
          font-weight:900; color:#1f2937;
          margin:0 0 10px; line-height:1.1;
        }
        .success-h1 span { color:#7c3aed; }
        .success-sub { color:#6b7280; font-size:1rem; margin:0; }

        /* Cards */
        .success-card {
          background:#fff;
          border:2px solid #e5e7eb;
          border-radius:18px;
          box-shadow:0 4px 16px rgba(0,0,0,0.05);
          overflow:hidden;
        }
        .success-card-inner { padding:24px; }

        /* Question snippet */
        .success-q-label {
          font-size:0.7rem; font-weight:700; color:#7c3aed;
          text-transform:uppercase; letter-spacing:0.08em; margin-bottom:10px;
        }
        .success-q-text {
          color:#374151; font-size:0.95rem; line-height:1.65;
          margin:0; font-style:italic;
          background:#f5f3ff;
          border-left:4px solid #7c3aed;
          border-radius:0 10px 10px 0;
          padding:14px 18px;
        }

        /* Stats row */
        .success-stats {
          display:grid; grid-template-columns:1fr 1fr 1fr;
          gap:12px; margin-top:20px;
        }
        .success-stat {
          border-radius:12px; padding:14px 12px; text-align:center;
        }
        .success-stat-label { font-size:0.68rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:5px; }
        .success-stat-value { font-size:1.15rem; font-weight:900; }

        /* Email notice */
        .success-email-notice {
          display:flex; align-items:center; gap:12px;
          background:#f0fdf4; border:1.5px solid #a7f3d0;
          border-radius:14px; padding:14px 18px;
        }
        .success-email-notice span { font-size:0.88rem; color:#374151; }

        /* Steps */
        .success-steps-title {
          font-size:0.7rem; font-weight:700; color:#9ca3af;
          text-transform:uppercase; letter-spacing:0.08em; margin-bottom:16px;
        }
        .success-step { display:flex; align-items:flex-start; gap:14px; margin-bottom:14px; }
        .success-step:last-child { margin-bottom:0; }
        .success-step-icon {
          width:36px; height:36px; flex-shrink:0;
          background:#f5f3ff; border-radius:10px;
          display:grid; place-items:center; font-size:1rem;
        }
        .success-step-title { font-weight:700; color:#1f2937; font-size:0.9rem; margin-bottom:2px; }
        .success-step-body { font-size:0.83rem; color:#6b7280; line-height:1.5; }

        /* CTA */
        .success-cta {
          display:block;
          background:linear-gradient(135deg,#7c3aed,#a855f7);
          color:#fff; text-align:center; padding:16px 24px;
          border-radius:99px; font-family:'Outfit',sans-serif;
          font-weight:800; font-size:1rem; text-decoration:none;
          box-shadow:0 8px 24px rgba(124,58,237,0.28);
          transition:transform 0.18s, box-shadow 0.18s;
        }
        .success-cta:hover { transform:translateY(-2px); box-shadow:0 14px 32px rgba(124,58,237,0.38); }

        /* Skeleton */
        @keyframes shimmer { 0%{opacity:0.5} 50%{opacity:1} 100%{opacity:0.5} }
        .skeleton { background:#e5e7eb; border-radius:8px; animation:shimmer 1.4s ease-in-out infinite; }
      `}</style>

      <div className="success-page">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="success-header">
          <Link href="/" className="success-logo">
            <div className="success-logo-icon">A</div>
            <span className="success-logo-text">AskExpert</span>
          </Link>
          <span className="success-badge-label">Payment Confirmation</span>
        </header>

        {/* ── Main ────────────────────────────────────────────────────────── */}
        <main className="success-main">
          {/* Hero */}
          <div className="success-hero">
            <div className="success-paid-pill">
              <span>✅</span> Payment Confirmed
            </div>
            <h1 className="success-h1">
              Your question is<br />
              <span>on its way! 🚀</span>
            </h1>
            <p className="success-sub">
              {session?.creatorName
                ? <><strong style={{ color: "#1f2937" }}>{session.creatorName}</strong> will answer shortly.</>
                : "Your expert will answer shortly."}
            </p>
          </div>

          {/* Details card */}
          {loading ? (
            <div className="success-card">
              <div className="success-card-inner" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="skeleton" style={{ height: 20, width: "60%" }} />
                <div className="skeleton" style={{ height: 64, width: "100%" }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <div className="skeleton" style={{ height: 60 }} />
                  <div className="skeleton" style={{ height: 60 }} />
                  <div className="skeleton" style={{ height: 60 }} />
                </div>
              </div>
            </div>
          ) : session ? (
            <div className="success-card">
              <div className="success-card-inner">
                {session.content && (
                  <>
                    <div className="success-q-label">Your Question</div>
                    <p className="success-q-text">
                      &ldquo;{session.content.slice(0, 160)}{session.content.length > 160 ? "…" : ""}&rdquo;
                    </p>
                  </>
                )}

                <div className="success-stats">
                  {priceDisplay && (
                    <div className="success-stat" style={{ background: "#f5f3ff" }}>
                      <div className="success-stat-label" style={{ color: "#7c3aed" }}>Paid</div>
                      <div className="success-stat-value" style={{ color: "#7c3aed" }}>{priceDisplay}</div>
                    </div>
                  )}
                  <div className="success-stat" style={{ background: "#fffbeb" }}>
                    <div className="success-stat-label" style={{ color: "#d97706" }}>Response Window</div>
                    <div className="success-stat-value" style={{ color: "#d97706", fontSize: "0.95rem" }}>
                      {formatDuration(session.responseTimeHours)}
                    </div>
                  </div>
                  <div className="success-stat" style={{ background: "#f0fdf4" }}>
                    <div className="success-stat-label" style={{ color: "#059669" }}>Refund Policy</div>
                    <div className="success-stat-value" style={{ color: "#059669", fontSize: "0.9rem" }}>Auto ✓</div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Email notice */}
          {session?.followerEmail && (
            <div className="success-email-notice">
              <span style={{ fontSize: "1.3rem" }}>📧</span>
              <span>
                Answer will be sent to{" "}
                <strong style={{ color: "#059669" }}>{session.followerEmail}</strong>
              </span>
            </div>
          )}

          {/* What happens next */}
          <div className="success-card">
            <div className="success-card-inner">
              <div className="success-steps-title">What happens next</div>
              {steps.map((s, i) => (
                <div key={i} className="success-step">
                  <div className="success-step-icon">{s.icon}</div>
                  <div>
                    <div className="success-step-title">{s.title}</div>
                    <div className="success-step-body">{s.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <Link href="/" className="success-cta">
            Back to Home →
          </Link>
        </main>
      </div>
    </>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#fafafa", display: "grid", placeItems: "center" }}>
        <div style={{ fontFamily: "'Inter',sans-serif", color: "#9ca3af" }}>Loading…</div>
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}
