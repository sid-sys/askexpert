"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import Tooltip from "./Tooltip";

export default function Sidebar() {
  const { user, logout, userProfile } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams?.get("tab");
  const router = useRouter();
  const navRef = useRef<HTMLDivElement>(null);
  // Profile-menu state moved to /upgrade. The avatar at the bottom of the
  // sidebar now navigates straight there instead of popping a local menu.

  const APP_ROUTES = ["/dashboard", "/questions", "/fans", "/profile", "/analytics", "/admin", "/upgrade"];
  const showSidebar = !!user && APP_ROUTES.some(r => pathname?.startsWith(r));
  const [isNarrow, setIsNarrow] = useState(false);
  
  // Collapse State
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    // Load from local storage
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setIsCollapsed(true);
    
    const check = () => setIsNarrow(window.innerWidth <= 900);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    // Sync with CSS variable for layout offset
    if (showSidebar && !isNarrow) {
      document.documentElement.style.setProperty("--sidebar-width", isCollapsed ? "80px" : "232px");
    } else {
      document.documentElement.style.removeProperty("--sidebar-width");
    }
    localStorage.setItem("sidebar-collapsed", isCollapsed ? "true" : "false");
  }, [isCollapsed, showSidebar, isNarrow]);

  useEffect(() => {
    if (showSidebar && !isNarrow && navRef.current) {
      const items = navRef.current.querySelectorAll(".s-item");
      gsap.fromTo(items,
        { opacity: 0, x: -12 },
        { opacity: 1, x: 0, stagger: 0.04, duration: 0.45, ease: "power3.out", delay: 0.1 }
      );
    }
  }, [showSidebar, isNarrow]);

  if (!showSidebar || isNarrow) return null;

  const handleLogout = async () => { await logout(); router.push("/"); };
  const isActive = (path: string, exact = false) => {
    return exact ? pathname === path : (pathname?.startsWith(path) ?? false);
  };

  const css = {
    aside: {
      width: isCollapsed ? 80 : 232, minWidth: isCollapsed ? 80 : 232, height: "100vh",
      background: "#0a0a0a",
      borderRight: "1px solid rgba(167,139,250,0.10)",
      display: "flex", flexDirection: "column" as const,
      position: "fixed" as const, top: 0, left: 0, zIndex: 900,
      overflow: "visible" as const,
      transition: "width 0.3s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    },
    brand: {
      padding: isCollapsed ? "22px 0 18px" : "22px 16px 18px",
      borderBottom: "1px solid rgba(167,139,250,0.08)",
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: isCollapsed ? "center" : "space-between",
      transition: "all 0.3s ease",
    },
    logoLink: {
      display: "flex", flexDirection: "row" as const,
      alignItems: "center", gap: 10, textDecoration: "none",
      justifyContent: isCollapsed ? "center" : "flex-start",
    },
    logoIcon: {
      background: "linear-gradient(135deg,#a78bfa,#7c3aed)",
      borderRadius: 10, width: 34, height: 34,
      display: "grid", placeItems: "center",
      fontFamily: "'Outfit',sans-serif", fontSize: "1rem", fontWeight: 900, color: "#fff",
      flexShrink: 0, boxShadow: "0 4px 14px rgba(124,58,237,0.4)",
    },
    logoText: {
      fontFamily: "'Outfit',sans-serif", fontWeight: 800,
      fontSize: "1.08rem", color: "#ffffff", letterSpacing: "-0.02em", lineHeight: 1,
      display: isCollapsed ? "none" : "block",
    },
    toggleBtn: {
      background: "transparent", border: "none", color: "rgba(167,139,250,0.6)",
      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
      width: 28, height: 28, borderRadius: 6, transition: "all 0.2s",
      marginLeft: isCollapsed ? 0 : "auto",
    },
    nav: {
      flex: 1, padding: "10px 10px",
      display: "flex", flexDirection: "column" as const,
      gap: 12,
      overflowY: "auto" as const,
      overflowX: "hidden" as const,
    },
    section: { marginBottom: 4 },
    label: {
      fontFamily: "'Outfit',sans-serif", fontSize: "0.58rem",
      fontWeight: 800, letterSpacing: "0.18em",
      color: "#f59e0b", textTransform: "uppercase" as const,
      margin: isCollapsed ? "0 0 8px 0" : "14px 0 4px 8px", padding: 0, lineHeight: 1,
      textAlign: isCollapsed ? "center" as const : "left" as const,
      display: isCollapsed ? "none" : "block"
    },
    item: (active: boolean, isAdmin = false): React.CSSProperties => ({
      display: "flex", flexDirection: "row", alignItems: "center",
      justifyContent: isCollapsed ? "center" : "flex-start",
      gap: 10, padding: isCollapsed ? "10px 0" : "7px 12px", borderRadius: 9,
      color: active ? "#ffffff" : isAdmin ? "rgba(245,158,11,0.7)" : "rgba(161,161,170,0.8)",
      textDecoration: "none",
      fontFamily: "'Outfit',sans-serif", fontWeight: active ? 700 : 500,
      fontSize: "0.82rem", lineHeight: 1,
      background: active ? "#f59e0b" : "transparent",
      border: "1px solid transparent",
      width: "100%", textAlign: "left" as const,
      whiteSpace: "nowrap" as const, overflow: "hidden",
      marginBottom: 2, cursor: "pointer",
      transition: "all 0.18s ease",
    }),
    collapseToggle: {
      position: "absolute" as const,
      right: -14,
      top: "50%",
      transform: "translateY(-50%)",
      width: 28,
      height: 28,
      background: "#fff",
      color: "#1f2937",
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      border: "none",
      boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
      zIndex: 100,
      transition: "all 0.2s ease",
      padding: 0,
    },
    iconWrap: {
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0, width: 20, height: 20,
    },
    labelSpan: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", display: isCollapsed ? "none" : "block" },
    ext: { fontSize: "0.68rem", opacity: 0.4, flexShrink: 0, display: isCollapsed ? "none" : "block" },
    footer: {
      padding: isCollapsed ? "12px 0 20px" : "12px 10px 20px",
      borderTop: "1px solid rgba(167,139,250,0.08)",
      display: "flex", flexDirection: "column" as const,
      alignItems: isCollapsed ? "center" : "stretch",
      gap: 8, flexShrink: 0,
    },
    user: {
      display: "flex", flexDirection: "row" as const,
      alignItems: "center", justifyContent: isCollapsed ? "center" : "flex-start", gap: 10, 
      padding: isCollapsed ? "8px 0" : "8px 10px",
      borderRadius: 10, background: isCollapsed ? "transparent" : "rgba(167,139,250,0.05)",
      border: isCollapsed ? "none" : "1px solid rgba(167,139,250,0.08)",
    },
    avatar: {
      width: 34, height: 34, borderRadius: "50%",
      background: "linear-gradient(135deg,#f59e0b,#fbbf24)",
      color: "#fff", display: "grid", placeItems: "center",
      fontFamily: "'Outfit',sans-serif", fontSize: "0.85rem", fontWeight: 800,
      flexShrink: 0, boxShadow: "0 2px 8px rgba(245,158,11,0.35)",
    },
    userInfo: { display: isCollapsed ? "none" : "flex", flexDirection: "column" as const, gap: 2, minWidth: 0 },
    userName: {
      fontFamily: "'Outfit',sans-serif", fontSize: "0.8rem", fontWeight: 700,
      color: "#e4e4e7", whiteSpace: "nowrap" as const, overflow: "hidden",
      textOverflow: "ellipsis", maxWidth: 140, lineHeight: 1.2,
    },
    userHandle: {
      fontFamily: "'Outfit',sans-serif", fontSize: "0.65rem",
      color: "rgba(167,139,250,0.55)", lineHeight: 1.2,
      whiteSpace: "nowrap" as const, overflow: "hidden",
      textOverflow: "ellipsis", maxWidth: 140,
    },
    logout: {
      display: "flex", flexDirection: "row" as const,
      alignItems: "center", justifyContent: isCollapsed ? "center" : "flex-start", gap: 8, 
      padding: isCollapsed ? "10px 0" : "8px 12px",
      borderRadius: 9, background: "transparent",
      border: isCollapsed ? "none" : "1px solid rgba(255,255,255,0.05)",
      color: "rgba(161,161,170,0.55)",
      fontFamily: "'Outfit',sans-serif", fontSize: "0.82rem", fontWeight: 500,
      cursor: "pointer", width: "100%", textAlign: "left" as const, lineHeight: 1,
      transition: "all 0.18s ease",
    },
  };

  const NavItem = ({ href, active, isAdmin = false, children, target, tooltipLabel }: any) => {
    const link = (
      <Link href={href} className="s-item" style={css.item(active, isAdmin)} target={target} rel={target ? "noopener noreferrer" : undefined}>
        {children}
      </Link>
    );

    if (isCollapsed && tooltipLabel) {
      return (
        <Tooltip content={tooltipLabel} placement="right">
          {link}
        </Tooltip>
      );
    }
    return link;
  };

  return (
    <aside style={css.aside} className="premium-sidebar">
      {/* Brand row — logo on the left, hamburger toggle on the right */}
      <div style={css.brand}>
        {!isCollapsed ? (
          <>
            <Link href="/" style={css.logoLink}>
              <div style={css.logoIcon}>A</div>
              <span style={css.logoText}>AskExpert</span>
            </Link>
            <button
              type="button"
              onClick={() => setIsCollapsed(true)}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              style={{
                background: "transparent", border: "none", cursor: "pointer",
                padding: 6, borderRadius: 8,
                color: "rgba(255,255,255,0.6)",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 0.15s, color 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.6)"; }}
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </svg>
            </button>
          </>
        ) : (
          // Collapsed: hamburger replaces the brand row entirely so it's the
          // single tap target to re-expand. Logo becomes a small "A" below.
          <button
            type="button"
            onClick={() => setIsCollapsed(false)}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              padding: 8, borderRadius: 8,
              color: "rgba(255,255,255,0.75)",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.75)"; }}
          >
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </button>
        )}
      </div>

      <nav style={css.nav} ref={navRef}>
        {/* MAIN */}
        <div style={css.section}>
          <p style={css.label}>MAIN</p>

          <NavItem href="/dashboard" active={isActive("/dashboard")} tooltipLabel="Dashboard">
            <span style={css.iconWrap}>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                <rect x="3" y="3" width="7" height="7" rx="1.5" fill="currentColor"/>
                <rect x="14" y="3" width="7" height="7" rx="1.5" fill="currentColor"/>
                <rect x="3" y="14" width="7" height="7" rx="1.5" fill="currentColor"/>
                <rect x="14" y="14" width="7" height="7" rx="1.5" fill="currentColor"/>
              </svg>
            </span>
            <span style={css.labelSpan}>Dashboard</span>
          </NavItem>

          <NavItem href="/questions" active={isActive("/questions")} tooltipLabel="Questions">
            <span style={css.iconWrap}>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
              </svg>
            </span>
            <span style={css.labelSpan}>Questions</span>
          </NavItem>

          <NavItem href="/fans" active={isActive("/fans")} tooltipLabel="Fans">
            <span style={css.iconWrap}>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            <span style={css.labelSpan}>Fans</span>
          </NavItem>

          <NavItem href="/analytics" active={isActive("/analytics")} tooltipLabel="Analytics">
            <span style={css.iconWrap}>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                <path d="M4 20V14M9 20V8M14 20V12M19 20V4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
              </svg>
            </span>
            <span style={css.labelSpan}>Analytics</span>
          </NavItem>
        </div>

        {/* ACCOUNT */}
        <div style={css.section}>
          <p style={css.label}>ACCOUNT</p>

          <NavItem href="/profile" active={pathname === "/profile" && !tab} tooltipLabel="Edit Profile">
            <span style={css.iconWrap}>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2"/>
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </span>
            <span style={css.labelSpan}>Edit Profile</span>
          </NavItem>

          <NavItem href="/profile?tab=pricing" active={pathname === "/profile" && tab === "pricing"} tooltipLabel="Pricing">
            <span style={css.iconWrap}>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/>
                <path d="M12 7v1m0 8v1M9.5 10a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </span>
            <span style={css.labelSpan}>Pricing</span>
          </NavItem>

          <NavItem href="/profile?tab=payout" active={pathname === "/profile" && tab === "payout"} tooltipLabel="Payout">
            <span style={css.iconWrap}>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                <rect x="2" y="6" width="20" height="13" rx="2" stroke="currentColor" strokeWidth="2"/>
                <path d="M2 10h20" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </span>
            <span style={css.labelSpan}>Payout</span>
          </NavItem>

        </div>

        {/* ADMIN */}
        {userProfile?.isAdmin && (
          <div style={css.section}>
            <p style={css.label}>ADMIN</p>
            <NavItem href="/admin" active={isActive("/admin")} isAdmin={true} tooltipLabel="Admin Panel">
              <span style={css.iconWrap}>
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                </svg>
              </span>
              <span style={css.labelSpan}>Admin Panel</span>
            </NavItem>
          </div>
        )}
      </nav>

      {/* Footer */}
      <div style={{ ...css.footer, position: "relative" }}>
        
        {/* UPGRADE PLAN LINK */}
        {userProfile && (
          <Link href="/upgrade" style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            background: "linear-gradient(135deg, #f59e0b, #fbbf24)", color: "#fff",
            padding: isCollapsed ? "10px" : "12px", borderRadius: 12,
            textDecoration: "none", fontWeight: 800, marginBottom: 16,
            boxShadow: "0 4px 14px rgba(245,158,11,0.3)",
            fontSize: isCollapsed ? "1.2rem" : "0.95rem"
          }}>
            🚀 {!isCollapsed && "Upgrade Plan"}
          </Link>
        )}

        {/* Creator / Fan toggle */}
        {!isCollapsed && (
          <div style={{ display: "flex", background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: 3, gap: 3, marginBottom: 4 }}>
            {([{ label: "Creator", href: "/dashboard" }, { label: "Fan", href: "/fan-dashboard" }] as const).map(({ label, href }) => {
              const active = label === "Creator";
              return (
                <button key={label} onClick={() => router.push(href)} style={{
                  flex: 1, padding: "7px 0", borderRadius: 8, border: "none",
                  fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: "0.78rem",
                  cursor: active ? "default" : "pointer",
                  background: active ? "#f59e0b" : "transparent",
                  // Dark text on the amber active background — white-on-amber
                  // had too little contrast and looked invisible.
                  color: active ? "#1f2937" : "rgba(161,161,170,0.6)",
                  transition: "all 0.18s",
                }}>
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {userProfile?.username && (
          isCollapsed ? (
            <Tooltip content={`${userProfile.displayName || userProfile.username}`} placement="right">
              <div style={{...css.user, cursor: "pointer"}} onClick={() => router.push("/upgrade")}>
                <div style={css.avatar}>
                  {(userProfile.displayName || userProfile.username)?.[0]?.toUpperCase() ?? "?"}
                </div>
              </div>
            </Tooltip>
          ) : (
            <div style={{...css.user, cursor: "pointer"}} onClick={() => router.push("/upgrade")}>
              <div style={css.avatar}>
                {(userProfile.displayName || userProfile.username)?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div style={css.userInfo}>
                <div style={css.userName}>{userProfile.displayName || userProfile.username}</div>
                <div style={css.userHandle}>@{userProfile.username}</div>
              </div>
            </div>
          )
        )}
        
        {isCollapsed ? (
          <Tooltip content="Sign out" placement="right">
            <button
              onClick={handleLogout}
              style={css.logout}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.08)"; (e.currentTarget as HTMLButtonElement).style.color = "#fca5a5"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(161,161,170,0.55)"; }}
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </Tooltip>
        ) : (
          <button
            onClick={handleLogout}
            style={css.logout}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.08)"; (e.currentTarget as HTMLButtonElement).style.color = "#fca5a5"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(161,161,170,0.55)"; }}
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Sign out
          </button>
        )}
      </div>

      <style jsx global>{`
        .premium-sidebar nav::-webkit-scrollbar {
          display: none;
        }
        .premium-sidebar nav {
          -ms-overflow-style: none;  /* IE and Edge */
          scrollbar-width: none;  /* Firefox */
        }
      `}</style>
    </aside>
  );
}
