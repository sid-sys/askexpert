"use client";
import { useState, useEffect } from "react";
import Swal from "sweetalert2";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";

// All known app routes — anything else is a creator [username] profile
const APP_ROUTES = ["/", "/dashboard", "/profile", "/analytics", "/admin", "/auth", "/login", "/signup", "/success"];

export default function NavBar() {
  const { user, loading, logout, userProfile } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);

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

  useEffect(() => {
    setMounted(true);
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Return placeholder or null during SSR to avoid hydration mismatch
  if (!mounted) return (
    <header style={{ height: 80, background: "transparent" }} />
  );

  // Hide the global nav on creator profile pages — they have their own dedicated navbar
  const isCreatorProfilePage = !APP_ROUTES.some((r) =>
    r === "/" ? pathname === "/" : pathname.startsWith(r)
  );

  if (isCreatorProfilePage) return null;

  // Hide on the standalone asker success page — no creator nav needed
  if (pathname?.startsWith("/success")) return null;

  // Hide on chat-heavy surfaces so the chat panel can bind itself to the
  // viewport without competing with a horizontal nav above.
  if (pathname?.startsWith("/fans") || pathname?.startsWith("/fan-dashboard") || pathname?.startsWith("/questions")) return null;


  const isActive = (path: string) => {
    if (path === "/" && pathname === "/") return true;
    if (path !== "/" && pathname?.startsWith(path)) return true;
    return false;
  };

  return (
    <header className="global-header" style={{
      background: "rgba(255, 255, 255, 0.95)",
      borderBottom: scrolled
        ? `1px solid #e5e7eb`
        : "1px solid transparent",
      boxShadow: scrolled ? "0 4px 20px rgba(0,0,0,0.06)" : "none",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "1rem 5%",
      position: "sticky",
      top: 0,
      zIndex: 1000,
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      backdropFilter: "blur(12px)",
    }}>
      {/* LOGO */}
      <Link href="/" style={{ textDecoration: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <div style={{
            background: "linear-gradient(135deg, #7c3aed, #a855f7)",
            color: "#fff",
            borderRadius: "10px",
            width: 36,
            height: 36,
            display: "grid",
            placeItems: "center",
            fontSize: "1.1rem",
            fontWeight: 900,
            boxShadow: "0 4px 12px rgba(124,58,237,0.3)",
          }}>A</div>
          <span style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: "1.5rem",
            fontWeight: 800,
            color: "#1f2937",
            letterSpacing: "-0.02em",
          }}>AskExpert</span>
        </div>
      </Link>

      {/* DESKTOP NAV / AUTH NAV */}
      <nav style={{ display: "flex", alignItems: "center", gap: "1rem" }}
           className={!user ? "desktop-nav" : "auth-nav"}>
        {loading ? (
          <div style={{ width: 150, height: 40, background: "rgba(0,0,0,0.04)", borderRadius: 99 }} />
        ) : !user ? (
          // ── Public / unauthenticated: render nothing on the top-right ──
          null
        ) : (
          // ── Authenticated: sidebar handles nav; show only top-bar extras ─
          <>
            {userProfile?.username && (
              <>
                <Link
                  href={`/${userProfile.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "0.5rem 1rem",
                    borderRadius: 99,
                    background: "rgba(167,139,250,0.08)",
                    border: "1px solid rgba(167,139,250,0.2)",
                    color: "#7c3aed",
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 700,
                    fontSize: "0.82rem",
                    textDecoration: "none",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(167,139,250,0.14)";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(167,139,250,0.08)";
                  }}
                >
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  <span className="nav-btn-text">View Profile</span>
                </Link>
                <button
                  onClick={handleCopyLink}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "0.5rem 1rem",
                  borderRadius: 99,
                  background: "rgba(124,58,237,0.08)",
                  border: "1px solid rgba(124,58,237,0.2)",
                  color: "#7c3aed",
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(124,58,237,0.14)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(124,58,237,0.08)";
                }}
              >
                <span className="nav-btn-text">🔗 Copy Link</span>
                <span className="nav-btn-icon">🔗</span>
              </button>
              </>
            )}
            <Link
              href="/dashboard"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "0.5rem 1.1rem",
                borderRadius: 99,
                background: "linear-gradient(135deg, #7c3aed, #a855f7)",
                color: "#fff",
                fontFamily: "'Inter', sans-serif",
                fontWeight: 800,
                fontSize: "0.82rem",
                textDecoration: "none",
                boxShadow: "0 4px 12px rgba(124,58,237,0.3)",
                transition: "all 0.2s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 18px rgba(124,58,237,0.4)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = "";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 12px rgba(124,58,237,0.3)";
              }}
            >
              <span className="nav-btn-text">📊 Dashboard</span>
              <span className="nav-btn-icon">📊</span>
            </Link>
          </>
        )}
      </nav>


      <style jsx>{`
        /* Desktop nav styles */
        .nav-link {
          font-family: 'Inter', sans-serif;
          font-size: 0.9rem;
          font-weight: 600;
          color: #4b5563;
          text-decoration: none;
          transition: all 0.2s;
          padding: 0.5rem 0.75rem;
          border-radius: 8px;
        }
        .nav-link:hover { color: #7c3aed; background: #f5f3ff; }
        .nav-link.active { color: #7c3aed; background: #f5f3ff; font-weight: 800; }


        .nav-btn-icon {
          display: none;
        }

        @media (max-width: 900px) {
          .desktop-nav { display: none !important; }
        }
        @media (max-width: 500px) {
          .nav-btn-text { display: none; }
          .nav-btn-icon { display: inline; }
        }
      `}</style>
    </header>
  );
}
