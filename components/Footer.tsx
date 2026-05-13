"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const footerLinks = [
  { label: "About Us", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
];

// Internal app surfaces that own their own layout/footer and shouldn't render
// the global marketing footer. Public marketing pages (/, /about, /pricing, …)
// continue to show it.
const APP_ROUTES_NO_FOOTER = [
  "/dashboard",
  "/fan-dashboard",
  "/fans",
  "/questions",
  "/analytics",
  "/profile",
  "/admin",
  "/upgrade",
  "/success",
];

export default function Footer() {
  const pathname = usePathname();
  if (pathname && APP_ROUTES_NO_FOOTER.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    return null;
  }
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
          <img
            src="/logo.png"
            alt="AskExpert"
            width={30}
            height={30}
            style={{ borderRadius: 8, display: "block", objectFit: "cover" }}
          />
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
