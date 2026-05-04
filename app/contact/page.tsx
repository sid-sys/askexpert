import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact Us – AskExpert",
  description:
    "Get in touch with the AskExpert team. We're here to help with questions, feedback, and partnership enquiries.",
};

const channels = [
  {
    icon: "✉️",
    title: "Email Support",
    desc: "For billing, account issues, and technical questions.",
    action: "support@askexpert.ink",
    href: "mailto:support@askexpert.ink",
    label: "Send Email",
  },
  {
    icon: "💼",
    title: "Business & Partnerships",
    desc: "Interested in integrating or partnering with AskExpert?",
    action: "hello@askexpert.ink",
    href: "mailto:hello@askexpert.ink",
    label: "Get in Touch",
  },
  {
    icon: "🐦",
    title: "Twitter / X",
    desc: "Quick questions and updates — follow us for news.",
    action: "@askexpert_ink",
    href: "https://twitter.com/askexpert_ink",
    label: "Follow Us",
  },
];

export default function ContactPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-white)",
        fontFamily: "'Outfit', sans-serif",
      }}
    >
      {/* Hero */}
      <section
        style={{
          background: "linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)",
          padding: "80px 24px 64px",
          textAlign: "center",
          color: "#fff",
        }}
      >
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div
            style={{
              fontSize: "2.5rem",
              marginBottom: 16,
              lineHeight: 1,
            }}
          >
            👋
          </div>
          <h1
            style={{
              fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
              fontWeight: 900,
              margin: "0 0 16px",
            }}
          >
            We&apos;d Love to Hear From You
          </h1>
          <p style={{ opacity: 0.85, fontSize: "1rem", lineHeight: 1.7 }}>
            Whether you have a question, a bug to report, or just want to say
            hello — pick the best channel below and we&apos;ll get back to you fast.
          </p>
        </div>
      </section>

      {/* Contact cards */}
      <section style={{ padding: "64px 24px", maxWidth: 900, margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 24,
          }}
        >
          {channels.map((ch) => (
            <div
              key={ch.title}
              style={{
                background: "#fff",
                border: "1px solid var(--border)",
                borderRadius: 20,
                padding: "32px 28px",
                boxShadow: "0 2px 16px rgba(0,0,0,0.05)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ fontSize: "2rem", marginBottom: 16 }}>{ch.icon}</div>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: "1.05rem",
                  color: "var(--text-dark)",
                  marginBottom: 8,
                }}
              >
                {ch.title}
              </div>
              <p
                style={{
                  color: "var(--text-muted)",
                  fontSize: "0.88rem",
                  lineHeight: 1.6,
                  flex: 1,
                  marginBottom: 20,
                }}
              >
                {ch.desc}
              </p>
              <Link
                href={ch.href}
                target={ch.href.startsWith("http") ? "_blank" : undefined}
                style={{
                  display: "inline-block",
                  background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
                  color: "#fff",
                  borderRadius: 10,
                  padding: "10px 20px",
                  fontWeight: 700,
                  fontSize: "0.88rem",
                  textDecoration: "none",
                  textAlign: "center",
                  transition: "opacity 0.2s",
                  opacity: 1,
                }}
              >
                {ch.label}
              </Link>
              <div
                style={{
                  marginTop: 12,
                  color: "var(--text-muted)",
                  fontSize: "0.8rem",
                  textAlign: "center",
                }}
              >
                {ch.action}
              </div>
            </div>
          ))}
        </div>

        {/* Response time note */}
        <div
          style={{
            marginTop: 48,
            background: "#f5f3ff",
            border: "1px solid #e0d7ff",
            borderRadius: 14,
            padding: "20px 24px",
            textAlign: "center",
          }}
        >
          <p style={{ margin: 0, color: "#5b21b6", fontSize: "0.9rem", fontWeight: 500 }}>
            ⏱️ We typically respond within <strong>24 hours</strong> on business days.
          </p>
        </div>
      </section>
    </div>
  );
}
