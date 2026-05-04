"use client";
import Link from "next/link";

const footerLinks = [
  { label: "About Us", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
];

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer
      style={{
        borderTop: "1px solid var(--border)",
        background: "var(--bg-soft)",
        padding: "40px 24px 28px",
        marginTop: "auto",
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "linear-gradient(135deg, var(--primary), var(--primary-dark))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 900,
              fontSize: "0.85rem",
            }}
          >
            A
          </div>
          <span
            style={{
              fontWeight: 700,
              fontSize: "1rem",
              color: "var(--text-dark)",
              fontFamily: "'Outfit', sans-serif",
            }}
          >
            AskExpert
          </span>
        </div>

        {/* Links */}
        <nav
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px 24px",
            alignItems: "center",
          }}
        >
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                color: "var(--text-muted)",
                textDecoration: "none",
                fontSize: "0.85rem",
                fontWeight: 500,
                transition: "color 0.2s",
              }}
              onMouseEnter={(e) =>
                ((e.target as HTMLElement).style.color = "var(--primary)")
              }
              onMouseLeave={(e) =>
                ((e.target as HTMLElement).style.color = "var(--text-muted)")
              }
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Copyright */}
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.8rem",
            margin: 0,
          }}
        >
          © {year} AskExpert. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
