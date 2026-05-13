"use client";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useState, useEffect } from "react";

const APP_ROUTES = ["/dashboard", "/questions", "/fans", "/profile", "/analytics", "/admin", "/upgrade", "/fan-dashboard"];

type NavItem = {
  key: string;
  label: string;
  icon: React.ReactNode;
  href?: string;        // Link nav (creator side)
  view?: string;        // ?view= nav (fan side)
};

const iconDashboard = (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
    <rect x="3" y="3" width="7" height="7" rx="1.5" fill="currentColor"/>
    <rect x="14" y="3" width="7" height="7" rx="1.5" fill="currentColor"/>
    <rect x="3" y="14" width="7" height="7" rx="1.5" fill="currentColor"/>
    <rect x="14" y="14" width="7" height="7" rx="1.5" fill="currentColor"/>
  </svg>
);
const iconChat = (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
  </svg>
);
const iconFans = (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const iconAnalytics = (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
    <path d="M4 20V14M9 20V8M14 20V12M19 20V4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
  </svg>
);
const iconDiscover = (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
    <path d="M17 17l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const iconSubs = (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
  </svg>
);

export default function BottomNav() {
  const { user, userProfile } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    setMounted(true);
    const check = () => {
      setIsMobile(window.innerWidth <= 900);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (!mounted) return null;

  const show = user && isMobile && APP_ROUTES.some((r) => pathname?.startsWith(r));
  if (!show) return null;

  const isFanView = pathname?.startsWith("/fan-dashboard") ?? false;
  const currentView = searchParams?.get("view") ?? "home";

  const goFanView = (view: string) => {
    router.replace(`/fan-dashboard?view=${view}`, { scroll: false });
  };

  const creatorItems: NavItem[] = [
    { key: "dashboard", label: "Home", icon: iconDashboard, href: "/dashboard" },
    { key: "questions", label: "Inbox", icon: iconChat, href: "/questions" },
    { key: "fans", label: "Fans", icon: iconFans, href: "/fans" },
    { key: "analytics", label: "Stats", icon: iconAnalytics, href: "/analytics" },
  ];

  const fanItems: NavItem[] = [
    { key: "home", label: "Home", icon: iconDashboard, view: "home" },
    { key: "discover", label: "Find", icon: iconDiscover, view: "discover" },
    { key: "questions", label: "Chats", icon: iconChat, view: "questions" },
    { key: "subscriptions", label: "Subs", icon: iconSubs, view: "subscriptions" },
  ];

  const items = isFanView ? fanItems : creatorItems;

  const isItemActive = (item: NavItem): boolean => {
    if (showProfile) return false;
    if (isFanView && item.view) return currentView === item.view;
    if (item.href) return pathname?.startsWith(item.href) ?? false;
    return false;
  };

  const handleTap = (item: NavItem) => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
    setShowProfile(false);
    if (item.href) router.push(item.href);
    else if (item.view) goFanView(item.view);
  };

  const profileInitial = (userProfile?.displayName || userProfile?.username || user?.email || "?")[0]?.toUpperCase() ?? "?";
  const profileName = userProfile?.displayName || userProfile?.username || user?.email?.split("@")[0] || "Me";

  const sheetLinks: { href: string; label: string; emoji: string }[] = [
    { href: "/profile", label: "Edit Profile", emoji: "📝" },
    { href: "/profile?tab=pricing", label: "Pricing", emoji: "💰" },
    { href: "/profile?tab=payout", label: "Payout", emoji: "🏦" },
    ...(userProfile?.isAdmin ? [{ href: "/admin", label: "Admin", emoji: "⭐" }] : []),
    { href: "/upgrade", label: "Account", emoji: "👤" },
  ];

  const openFeedback = () => {
    setShowProfile(false);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("open-feedback"));
    }
  };

  return (
    <>
      <div style={{ height: 72 }} />

      {/* Profile sheet — holds settings + Creator/Fan toggle + feedback */}
      {showProfile && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 940, background: "rgba(0,0,0,0.35)" }}
            onClick={() => setShowProfile(false)}
          />
          <div style={{
            position: "fixed",
            bottom: "80px",
            right: 8,
            left: 8,
            margin: "0 auto",
            maxWidth: 360,
            background: "#1f2937",
            borderRadius: 18,
            padding: 14,
            boxShadow: "0 16px 40px rgba(0,0,0,0.55)",
            border: "1px solid rgba(167,139,250,0.2)",
            zIndex: 999,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            animation: "slideUp 0.2s ease-out",
          }}>
            {/* Identity header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 6px 10px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{
                width: 40, height: 40, borderRadius: "50%",
                background: "linear-gradient(135deg,#7c3aed,#a855f7)",
                color: "#fff", display: "grid", placeItems: "center",
                fontFamily: "'Outfit',sans-serif", fontSize: "1rem", fontWeight: 800,
                flexShrink: 0,
              }}>
                {profileInitial}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: "0.9rem", fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profileName}</div>
                {userProfile?.username && (
                  <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: "0.72rem", color: "rgba(167,139,250,0.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{userProfile.username}</div>
                )}
              </div>
            </div>

            {/* Creator/Fan toggle */}
            <div role="group" aria-label="Switch role" style={{
              display: "flex",
              background: "rgba(255,255,255,0.06)",
              borderRadius: 10,
              padding: 3,
              gap: 3,
            }}>
              {([
                { label: "Creator", href: "/dashboard", active: !isFanView },
                { label: "Fan", href: "/fan-dashboard", active: isFanView },
              ] as const).map(({ label, href, active }) => (
                <button
                  key={label}
                  type="button"
                  className="bnav-sheet-toggle"
                  aria-pressed={active}
                  onClick={() => {
                    if (active) return;
                    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
                    setShowProfile(false);
                    router.push(href);
                  }}
                  style={{
                    flex: 1,
                    padding: "8px 0",
                    borderRadius: 8,
                    border: "none",
                    fontFamily: "'Outfit',sans-serif",
                    fontWeight: 800,
                    fontSize: "0.85rem",
                    cursor: active ? "default" : "pointer",
                    background: active ? "#f59e0b" : "transparent",
                    color: active ? "#1f2937" : "rgba(161,161,170,0.7)",
                    transition: "background 0.18s, color 0.18s",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Settings links */}
            {sheetLinks.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setShowProfile(false)}
                className="bnav-sheet-link"
                style={{
                  width: "100%", padding: "11px 12px", background: "rgba(255,255,255,0.05)",
                  border: "none", borderRadius: 10, color: "#fff",
                  fontWeight: 600, fontSize: "0.9rem", textDecoration: "none",
                  display: "flex", alignItems: "center", gap: 10,
                  fontFamily: "'Outfit',sans-serif",
                }}
              >
                <span style={{ fontSize: "1.05rem" }}>{it.emoji}</span>
                <span>{it.label}</span>
              </Link>
            ))}

            {/* Feedback (mirrors the floating button so mobile users can reach it) */}
            <button
              type="button"
              className="bnav-sheet-link"
              onClick={openFeedback}
              style={{
                width: "100%", padding: "11px 12px", background: "rgba(255,255,255,0.05)",
                border: "none", borderRadius: 10, color: "#fff",
                fontWeight: 600, fontSize: "0.9rem", textAlign: "left",
                display: "flex", alignItems: "center", gap: 10,
                fontFamily: "'Outfit',sans-serif", cursor: "pointer",
              }}
            >
              <span style={{ fontSize: "1.05rem" }}>💬</span>
              <span>Send Feedback</span>
            </button>
          </div>
        </>
      )}

      <nav
        className="mobile-bottom-nav"
        aria-label="Primary"
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          height: 64,
          background: "#0a0a0a",
          borderTop: "1px solid rgba(167,139,250,0.12)",
          display: "flex",
          alignItems: "stretch",
          justifyContent: "space-between",
          overflow: "hidden",
          zIndex: 950,
          paddingBottom: "env(safe-area-inset-bottom)",
          paddingLeft: 4,
          paddingRight: 4,
          gap: 2,
          boxSizing: "border-box",
        }}
      >
        {items.map((item) => {
          const active = isItemActive(item);
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => handleTap(item)}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              className={`bnav-cell${active ? " bnav-active" : ""}`}
              style={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: active ? "#f59e0b" : "rgba(161,161,170,0.65)",
                fontFamily: "'Outfit', sans-serif",
                transition: "color 0.18s ease",
                position: "relative",
              }}
            >
              {active && (
                <span style={{
                  position: "absolute",
                  top: 0,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 24,
                  height: 2,
                  borderRadius: "0 0 4px 4px",
                  background: "#f59e0b",
                }} />
              )}
              <span
                aria-hidden="true"
                style={{
                  color: active ? "#f59e0b" : "rgba(161,161,170,0.6)",
                  display: "inline-flex",
                  width: 20,
                  height: 20,
                }}
              >
                {item.icon}
              </span>
              <span style={{
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>{item.label}</span>
            </button>
          );
        })}

        {/* Profile slot — avatar opens the sheet */}
        <button
          type="button"
          onClick={() => {
            if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
            setShowProfile((v) => !v);
          }}
          aria-haspopup="menu"
          aria-expanded={showProfile}
          aria-label="Profile menu"
          className={`bnav-cell bnav-profile${showProfile ? " bnav-active" : ""}`}
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 3,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: showProfile ? "#f59e0b" : "rgba(161,161,170,0.65)",
            fontFamily: "'Outfit', sans-serif",
            transition: "color 0.18s ease",
            position: "relative",
          }}
        >
          {showProfile && (
            <span style={{
              position: "absolute",
              top: 0,
              left: "50%",
              transform: "translateX(-50%)",
              width: 24,
              height: 2,
              borderRadius: "0 0 4px 4px",
              background: "#f59e0b",
            }} />
          )}
          <span style={{
            width: 22, height: 22, borderRadius: "50%",
            background: "linear-gradient(135deg,#7c3aed,#a855f7)",
            color: "#fff", display: "grid", placeItems: "center",
            fontFamily: "'Outfit',sans-serif", fontSize: "0.7rem", fontWeight: 800,
            boxShadow: showProfile ? "0 0 0 2px #f59e0b" : "0 2px 6px rgba(124,58,237,0.35)",
            transition: "box-shadow 0.18s",
          }}>
            {profileInitial}
          </span>
          <span style={{
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>Profile</span>
        </button>
      </nav>

      <style jsx global>{`
        .mobile-bottom-nav::-webkit-scrollbar { display: none; }
        .mobile-bottom-nav {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        /* Override the universal button rule in globals.css. That rule
           forces padding: 6px 14px and font-size: 0.75rem !important on
           every <button>, which blows out our tight bottom-nav cells. */
        .mobile-bottom-nav .bnav-cell {
          padding: 6px 4px !important;
          font-size: 0.6rem !important;
          font-weight: 500 !important;
          border-radius: 10px !important;
          line-height: 1 !important;
        }
        .mobile-bottom-nav .bnav-cell.bnav-active {
          font-weight: 700 !important;
        }
        .mobile-bottom-nav .bnav-cell svg {
          width: 1.125rem !important;
          height: 1.125rem !important;
        }
        .bnav-sheet-toggle {
          padding: 8px 0 !important;
          font-size: 0.85rem !important;
          font-weight: 800 !important;
          border-radius: 8px !important;
          line-height: 1 !important;
        }
        .bnav-sheet-link {
          padding: 11px 12px !important;
          font-size: 0.9rem !important;
          font-weight: 600 !important;
          border-radius: 10px !important;
          line-height: 1.1 !important;
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
