"use client";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useState, useEffect } from "react";
import Swal from "sweetalert2";

const APP_ROUTES = ["/dashboard", "/questions", "/fans", "/profile", "/analytics", "/admin", "/upgrade"];

export default function BottomNav() {
  const { user, userProfile } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams?.get("tab");
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isSmallMobile, setIsSmallMobile] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  useEffect(() => {
    setMounted(true);
    const check = () => {
      setIsMobile(window.innerWidth <= 900);
      setIsSmallMobile(window.innerWidth < 500);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (!mounted) return null;

  const show = user && isMobile && APP_ROUTES.some((r) => pathname?.startsWith(r));
  if (!show) return null;

  // Account actions (billing, delete, sign-out) now live on /upgrade.

  const handleCopyLink = () => {
    if (!userProfile?.username) return;
    const url = `${window.location.origin}/${userProfile.username}`;
    navigator.clipboard.writeText(url);
    Swal.fire({
      icon: 'success',
      title: 'Link Copied!',
      text: 'Your public profile link is now on your clipboard.',
      timer: 2000,
      showConfirmButton: false,
      background: '#fff',
      color: '#1f2937',
      toast: true,
      position: 'top-end',
      timerProgressBar: true
    });
  };

  const isActive = (path: string, exact = false) => {
    const match = exact ? pathname === path : (pathname?.startsWith(path) ?? false);
    return match && !showSettingsMenu;
  };

  const navItems = [
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: (
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="7" rx="1.5" fill="currentColor"/>
          <rect x="14" y="3" width="7" height="7" rx="1.5" fill="currentColor"/>
          <rect x="3" y="14" width="7" height="7" rx="1.5" fill="currentColor"/>
          <rect x="14" y="14" width="7" height="7" rx="1.5" fill="currentColor"/>
        </svg>
      ),
    },
    {
      href: "/questions",
      label: "Questions",
      icon: (
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      href: "/fans",
      label: "Fans",
      icon: (
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      href: "/analytics",
      label: "Analytics",
      icon: (
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
          <path d="M4 20V14M9 20V8M14 20V12M19 20V4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      href: "/profile",
      label: "Edit Profile",
      icon: (
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2"/>
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      href: "/profile?tab=pricing",
      label: "Pricing",
      icon: (
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/>
          <path d="M12 7v1m0 8v1M9.5 10a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      href: "/profile?tab=payout",
      label: "Payout",
      icon: (
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
          <rect x="2" y="6" width="20" height="13" rx="2" stroke="currentColor" strokeWidth="2"/>
          <path d="M2 10h20" stroke="currentColor" strokeWidth="2"/>
        </svg>
      ),
    },
    ...(userProfile?.isAdmin ? [{
      href: "/admin",
      label: "Admin",
      icon: (
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
        </svg>
      ),
    }] : []),
  ];

  let displayNavItems = navItems.map(item => ({ ...item, isSettings: false }));
  if (isSmallMobile) {
    // Correctly filter out individual settings items on small screens
    displayNavItems = displayNavItems.filter(item => 
      !item.href.includes("tab=pricing") && 
      !item.href.includes("tab=payout") &&
      item.href !== "/admin"
    );
    
    const settingsItem = displayNavItems.find(item => item.href === "/profile");
    if (settingsItem) {
      settingsItem.label = "Settings";
      settingsItem.isSettings = true;
    }
  }

  return (
    <>
      <div style={{ height: 72 }} />

      {/* Settings Menu Modal/Popover */}
      {showSettingsMenu && (
        <>
          <div 
            style={{ position: 'fixed', inset: 0, zIndex: 940 }}
            onClick={() => setShowSettingsMenu(false)}
          />
          <div style={{
            position: "fixed",
            bottom: "80px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1f2937",
            borderRadius: 16,
            padding: 12,
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            border: "1px solid rgba(167,139,250,0.2)",
            zIndex: 999,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            minWidth: 160,
            animation: "slideUp 0.2s ease-out"
          }}>
            <Link
              href="/profile"
              onClick={() => setShowSettingsMenu(false)}
              style={{
                width: "100%", padding: "10px", background: "rgba(255,255,255,0.05)",
                border: "none", borderRadius: 8, color: "#fff",
                fontWeight: 600, fontSize: "0.85rem", textDecoration: "none",
                display: "flex", alignItems: "center", gap: 8
              }}
            >
              📝 Edit Profile
            </Link>
            <Link
              href="/profile?tab=pricing"
              onClick={() => setShowSettingsMenu(false)}
              style={{
                width: "100%", padding: "10px", background: "rgba(255,255,255,0.05)",
                border: "none", borderRadius: 8, color: "#fff",
                fontWeight: 600, fontSize: "0.85rem", textDecoration: "none",
                display: "flex", alignItems: "center", gap: 8
              }}
            >
              💰 Pricing
            </Link>
            <Link
              href="/profile?tab=payout"
              onClick={() => setShowSettingsMenu(false)}
              style={{
                width: "100%", padding: "10px", background: "rgba(255,255,255,0.05)",
                border: "none", borderRadius: 8, color: "#fff",
                fontWeight: 600, fontSize: "0.85rem", textDecoration: "none",
                display: "flex", alignItems: "center", gap: 8
              }}
            >
              🏦 Payout
            </Link>
          </div>
        </>
      )}

      {/* Profile popover removed — the avatar at the right of the bottom nav
          now navigates straight to /upgrade where billing, sign-out, and
          account-delete live. */}

      <nav 
        className="mobile-bottom-nav"
        style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        height: 64,
        background: "#0a0a0a",
        borderTop: "1px solid rgba(167,139,250,0.12)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-around",
        overflowX: "auto",
        zIndex: 950,
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: 8,
        paddingRight: 8,
        gap: 8,
      }}>
        {displayNavItems.map((item) => {
          const isSettingsActive = item.isSettings && (isActive("/profile") || isActive("/profile?tab=pricing") || isActive("/profile?tab=payout"));
          const active = (isActive(item.href) || isSettingsActive);
          const highlighted = active || (item.isSettings && showSettingsMenu);

          if (item.isSettings) {
            return (
              <div
                key={item.href}
                onClick={() => {
                  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
                  setShowSettingsMenu(!showSettingsMenu);
                  setShowProfileMenu(false);
                }}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                  padding: "8px 12px", borderRadius: 10, cursor: "pointer",
                  color: highlighted ? "#f59e0b" : "rgba(161,161,170,0.6)",
                  fontFamily: "'Outfit', sans-serif", fontSize: "0.62rem",
                  fontWeight: highlighted ? 700 : 500, transition: "all 0.18s ease",
                  minWidth: 56, flexShrink: 0, position: "relative",
                }}
              >
                {highlighted && (
                  <span style={{
                    position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
                    width: 24, height: 2, borderRadius: "0 0 4px 4px", background: "#7c3aed",
                  }} />
                )}
                <span style={{ color: highlighted ? "#f59e0b" : "rgba(161,161,170,0.55)" }}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.vibrate) {
                  navigator.vibrate(8);
                }
                setShowSettingsMenu(false);
                setShowProfileMenu(false);
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                padding: "8px 12px",
                borderRadius: 10,
                textDecoration: "none",
                color: active ? "#f59e0b" : "rgba(161,161,170,0.6)",
                fontFamily: "'Outfit', sans-serif",
                fontSize: "0.62rem",
                fontWeight: active ? 700 : 500,
                transition: "all 0.18s ease",
                minWidth: 56,
                flexShrink: 0,
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
              <span style={{ color: active ? "#f59e0b" : "rgba(161,161,170,0.55)" }}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}

        {/* User Profile Item — taps go straight to /upgrade where all the
            account actions (billing, sign out, delete) now live. */}
        <Link
          href="/upgrade"
          onClick={() => {
            if (typeof navigator !== "undefined" && navigator.vibrate) {
              navigator.vibrate(8);
            }
            setShowSettingsMenu(false);
          }}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
            padding: "8px 12px",
            borderRadius: 10,
            cursor: "pointer",
            color: pathname?.startsWith("/upgrade") ? "#f59e0b" : "rgba(161,161,170,0.6)",
            fontFamily: "'Outfit', sans-serif",
            fontSize: "0.62rem",
            fontWeight: pathname?.startsWith("/upgrade") ? 700 : 500,
            minWidth: 56,
            flexShrink: 0,
            textDecoration: "none",
          }}
        >
          <div style={{
            width: 20, height: 20, borderRadius: "50%",
            background: "linear-gradient(135deg,#7c3aed,#a855f7)",
            color: "#fff", display: "grid", placeItems: "center",
            fontFamily: "'Outfit',sans-serif", fontSize: "0.65rem", fontWeight: 800,
            boxShadow: "0 2px 8px rgba(124,58,237,0.3)",
          }}>
            {(userProfile?.displayName || userProfile?.username)?.[0]?.toUpperCase() ?? "?"}
          </div>
          <span style={{ maxWidth: 44, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" }}>
            {userProfile?.displayName?.split(" ")[0] || userProfile?.username || "Me"}
          </span>
        </Link>
      </nav>

      <style jsx global>{`
        .mobile-bottom-nav::-webkit-scrollbar {
          display: none;
        }
        .mobile-bottom-nav {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
