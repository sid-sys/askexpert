"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/types";
import Swal from "sweetalert2";
import ChatThread, { useChatUnread, useChatPreview } from "@/components/ChatThread";

type Subscription = {
  id: string;
  creatorId: string;
  creatorUsername?: string;
  creatorName?: string;
  status: string;
};

type Question = {
  id: string;
  content: string;
  status: string;
  response?: string;
  createdAt: Date;
  creatorId: string;
  creatorUsername?: string;
};

type NavId = "home" | "discover" | "subscriptions" | "questions" | "settings";

const NAV: { id: NavId; label: string; icon: React.ReactElement }[] = [
  {
    id: "home", label: "Home",
    icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="14" y="3" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="3" y="14" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="14" y="14" width="7" height="7" rx="1.5" fill="currentColor"/></svg>,
  },
  {
    id: "discover", label: "Discover",
    icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/><path d="M17 17l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  },
  {
    id: "subscriptions", label: "Subscriptions",
    icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>,
  },
  {
    id: "questions", label: "My Questions",
    icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>,
  },
];

export default function FanDashboardPage() {
  const { user, userProfile, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeNav, setActiveNav] = useState<NavId>("home");
  const [creatorUrl, setCreatorUrl] = useState("");
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  // Two-pane "My Questions" chat tab — which subscription is the active thread?
  const [selectedChatSub, setSelectedChatSub] = useState<string | null>(null);
  // Mobile single-pane switching for the chat tab. Matches the same 800px
  // breakpoint the rest of the fan-dashboard mobile chrome uses (hamburger,
  // .fan-bnav), so the chat goes mobile at the same width as everything else.
  const [isChatMobile, setIsChatMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 800px)");
    const update = () => setIsChatMobile(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  // Lock body scroll while the mobile chat overlay is open so the page
  // behind it can't move.
  const fanChatOverlayActive = isChatMobile && activeNav === "questions" && selectedChatSub !== null;
  useEffect(() => {
    if (!fanChatOverlayActive) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [fanChatOverlayActive]);

  const handleManageSubscription = async () => {
    if (!user) return;
    setPortalLoading(true);
    try {
      const { getIdToken } = await import("firebase/auth");
      const token = await getIdToken(user as any);
      const res = await fetch("/api/stripe/billing-portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ returnUrl: "/fan-dashboard" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not open billing portal");
      if (data.url) window.location.href = data.url;
    } catch (err: any) {
      Swal.fire({
        title: "Couldn't open billing portal",
        text: err.message || "Try again in a moment.",
        icon: "error",
        confirmButtonColor: "var(--purple)",
      });
    } finally {
      setPortalLoading(false);
    }
  };

  // ── Post-subscribe landing: confirm + nudge webhook fallback ────────────
  useEffect(() => {
    const subscribed = searchParams?.get("subscribed");
    const sessionId = searchParams?.get("session_id");
    if (subscribed !== "1") return;

    // Best-effort: hit /api/stripe/session so the server-side fallback can
    // create the subscription doc if the webhook hasn't fired yet. We ignore
    // the response either way.
    if (sessionId) {
      fetch(`/api/stripe/session?session_id=${encodeURIComponent(sessionId)}`).catch(() => {});
    }

    Swal.fire({
      title: "You're subscribed! 🎉",
      text: "Your monthly subscription is active. Ask the creator anything from their profile.",
      icon: "success",
      confirmButtonColor: "var(--purple)",
      confirmButtonText: "Got it",
    });

    // Strip the query params so a refresh doesn't re-fire the toast.
    router.replace("/fan-dashboard");
  }, [searchParams, router]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeQFilter, setActiveQFilter] = useState<"ALL" | "PENDING" | "ANSWERED">("ALL");

  useEffect(() => {
    if (user === null) router.push("/auth?redirect=/fan-dashboard");
  }, [user, router]);

  useEffect(() => {
    if (!user) return;
    const run = async () => {
      setLoading(true);
      try {
        const subSnap = await getDocs(
          query(collection(db, COLLECTIONS.SUBSCRIPTIONS), where("followerId", "==", user.uid), where("status", "==", "active"))
        );
        const raw = subSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Subscription));
        const enriched = await Promise.all(raw.map(async (sub) => {
          try {
            const snap = await getDocs(query(collection(db, COLLECTIONS.USERS), where("uid", "==", sub.creatorId)));
            if (!snap.empty) {
              const cd = snap.docs[0].data();
              return { ...sub, creatorUsername: cd.username, creatorName: cd.displayName };
            }
          } catch { /* ignore */ }
          return sub;
        }));
        setSubscriptions(enriched);

        const qSnap = await getDocs(query(collection(db, COLLECTIONS.QUESTIONS), where("followerUid", "==", user.uid)));
        const creatorIds = [...new Set(qSnap.docs.map((d) => d.data().creatorId).filter(Boolean))];
        const cm: Record<string, string> = {};
        await Promise.all(creatorIds.map(async (cid) => {
          try {
            const snap = await getDocs(query(collection(db, COLLECTIONS.USERS), where("uid", "==", cid)));
            if (!snap.empty) cm[cid] = snap.docs[0].data().username;
          } catch { /* ignore */ }
        }));
        setQuestions(
          qSnap.docs.map((d) => {
            const data = d.data();
            return { id: d.id, content: data.content || "", status: data.status || "PENDING", response: data.response || "", createdAt: data.createdAt?.toDate?.() ?? new Date(), creatorId: data.creatorId || "", creatorUsername: cm[data.creatorId] || "" } as Question;
          }).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        );
      } catch (err) { console.error("Fan dashboard:", err); }
      finally { setLoading(false); }
    };
    run();
  }, [user]);

  const go = (nav: NavId) => { setActiveNav(nav); setMobileOpen(false); };
  const handleFindCreator = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = creatorUrl.trim(); if (!raw) return;
    try { router.push(raw.startsWith("http") ? new URL(raw).pathname : raw.startsWith("/") ? raw : `/${raw}`); } catch { /* ignore */ }
  };
  const handleLogout = async () => { await logout(); router.push("/"); };

  if (!user) return null;

  const displayName = userProfile?.displayName || user.email?.split("@")[0] || "Fan";
  const username = userProfile?.username || "";
  const initial = (userProfile?.displayName || userProfile?.username || "F")[0].toUpperCase();
  const answeredCount = questions.filter((q) => q.status === "ANSWERED").length;
  const pendingCount  = questions.filter((q) => q.status === "PENDING").length;

  const sidebarNav = (
    <nav style={{ flex: 1, padding: "10px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
      <p style={{ fontFamily: "'Outfit',sans-serif", fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.18em", color: "rgba(167,139,250,0.45)", textTransform: "uppercase", margin: "14px 0 4px 8px" }}>FAN</p>
      {NAV.map((item) => {
        const active = activeNav === item.id;
        return (
          <button key={item.id} onClick={() => go(item.id)} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "9px 12px", borderRadius: 9, border: "none", width: "100%", textAlign: "left",
            background: active ? "#f59e0b" : "transparent",
            color: active ? "#fff" : "rgba(161,161,170,0.8)",
            fontFamily: "'Outfit',sans-serif", fontWeight: active ? 700 : 500, fontSize: "0.88rem",
            cursor: "pointer", transition: "all 0.18s", marginBottom: 2,
          }}>
            <span style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{item.icon}</span>
            {item.label}
          </button>
        );
      })}

    </nav>
  );

  const sidebarFooter = (
    <div style={{ padding: "12px 10px 20px", borderTop: "1px solid rgba(167,139,250,0.08)", display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Creator / Fan toggle */}
      <div style={{ display: "flex", background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: 3, gap: 3 }}>
        {([{ label: "Creator", href: "/dashboard" }, { label: "Fan", href: "/fan-dashboard" }] as const).map(({ label, href }) => {
          const active = label === "Fan";
          return (
            <button key={label} onClick={() => router.push(href)} style={{
              flex: 1, padding: "7px 0", borderRadius: 8, border: "none",
              fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: "0.78rem",
              cursor: active ? "default" : "pointer",
              background: active ? "#f59e0b" : "transparent",
              color: active ? "#1f2937" : "rgba(161,161,170,0.6)",
              transition: "all 0.18s",
            }}>
              {label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => go("settings")}
        title="Open settings"
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 10px", borderRadius: 10,
          background: activeNav === "settings" ? "rgba(167,139,250,0.14)" : "rgba(167,139,250,0.05)",
          border: "1px solid rgba(167,139,250,0.08)",
          textAlign: "left", cursor: "pointer", width: "100%",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(167,139,250,0.14)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = activeNav === "settings" ? "rgba(167,139,250,0.14)" : "rgba(167,139,250,0.05)"; }}
      >
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", display: "grid", placeItems: "center", fontFamily: "'Outfit',sans-serif", fontSize: "0.85rem", fontWeight: 800, flexShrink: 0 }}>
          {initial}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: "0.8rem", fontWeight: 700, color: "#e4e4e7", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 130 }}>{displayName}</div>
          {username && <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: "0.65rem", color: "rgba(167,139,250,0.55)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 130 }}>@{username}</div>}
        </div>
      </button>
      <button onClick={handleLogout} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.05)", background: "transparent", color: "rgba(161,161,170,0.55)", fontFamily: "'Outfit',sans-serif", fontSize: "0.82rem", fontWeight: 500, cursor: "pointer", width: "100%", textAlign: "left", transition: "all 0.18s" }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.08)"; (e.currentTarget as HTMLButtonElement).style.color = "#fca5a5"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(161,161,170,0.55)"; }}
      >
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Sign out
      </button>
    </div>
  );

  const statCard = (label: string, value: string | number, icon: string, iconBg: string, valueColor: string) => (
    <div
      style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 16, padding: "20px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.04)", transition: "box-shadow 0.2s, transform 0.2s" }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(124,58,237,0.1)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.04)"; (e.currentTarget as HTMLElement).style.transform = ""; }}
    >
      <div style={{ width: 42, height: 42, borderRadius: 12, background: iconBg, display: "grid", placeItems: "center", fontSize: "1.2rem", flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: "1.5rem", fontWeight: 800, color: valueColor, lineHeight: 1 }}>{loading ? "—" : value}</div>
        <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: "0.72rem", fontWeight: 600, color: "#999", marginTop: 3 }}>{label}</div>
      </div>
    </div>
  );

  const statusBadge = (status: string) => {
    const cfg = status === "ANSWERED" ? { bg: "#dcfce7", color: "#166534" } : status === "PENDING" ? { bg: "#fef3c7", color: "#92400e" } : { bg: "#f3f4f6", color: "#6b7280" };
    return <span style={{ ...cfg, borderRadius: 99, padding: "3px 10px", fontSize: "0.68rem", fontWeight: 800, whiteSpace: "nowrap" as const, fontFamily: "'Outfit',sans-serif", textTransform: "uppercase" as const }}>{status}</span>;
  };

  const sectionTitle = (text: string) => (
    <p style={{ fontFamily: "'Outfit',sans-serif", fontSize: "0.65rem", fontWeight: 800, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 16 }}>{text}</p>
  );

  const card = (children: React.ReactNode, extra?: React.CSSProperties) => (
    <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 16, padding: "24px", boxShadow: "0 1px 6px rgba(0,0,0,0.04)", marginBottom: 20, ...extra }}>{children}</div>
  );

  const emptyState = (icon: string, text: string, cta?: { label: string; nav?: NavId; href?: string }) => (
    <div style={{ textAlign: "center", padding: "48px 24px" }}>
      <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>{icon}</div>
      <p style={{ fontFamily: "'Outfit',sans-serif", color: "#9ca3af", marginBottom: 20, fontSize: "0.92rem" }}>{text}</p>
      {cta && (
        cta.href
          ? <a href={cta.href} style={{ display: "inline-block", background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", padding: "10px 22px", borderRadius: 12, fontWeight: 700, fontSize: "0.88rem", textDecoration: "none", fontFamily: "'Outfit',sans-serif" }}>{cta.label}</a>
          : <button onClick={() => cta.nav && go(cta.nav)} style={{ background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", border: "none", padding: "10px 22px", borderRadius: 12, fontWeight: 700, fontSize: "0.88rem", cursor: "pointer", fontFamily: "'Outfit',sans-serif" }}>{cta.label}</button>
      )}
    </div>
  );

  const creatorRow = (sub: Subscription) => (
    <div key={sub.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid #f3f4f6" }}>
      <div style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#a855f7)", display: "grid", placeItems: "center", color: "#fff", fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: "0.85rem", flexShrink: 0 }}>
        {(sub.creatorName || sub.creatorUsername || "?")[0].toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, color: "#1f2937", fontSize: "0.9rem", margin: "0 0 2px" }}>{sub.creatorName || sub.creatorUsername || sub.creatorId}</p>
        {sub.creatorUsername && <p style={{ fontFamily: "'Outfit',sans-serif", color: "#9ca3af", fontSize: "0.75rem", margin: 0 }}>@{sub.creatorUsername}</p>}
      </div>
      <span style={{ background: "#dcfce7", color: "#166534", borderRadius: 99, padding: "2px 10px", fontSize: "0.68rem", fontWeight: 800, fontFamily: "'Outfit',sans-serif" }}>Active</span>
      {sub.creatorUsername && (
        <a href={`/${sub.creatorUsername}`} style={{ color: "#7c3aed", fontWeight: 700, fontSize: "0.82rem", textDecoration: "none", padding: "6px 14px", border: "1.5px solid #ede9fe", borderRadius: 10, fontFamily: "'Outfit',sans-serif", whiteSpace: "nowrap" }}>Ask →</a>
      )}
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap');
        .fan-root * { box-sizing: border-box; margin: 0; padding: 0; }
        .fan-sidebar { width: 232px; min-width: 232px; height: 100vh; background: #0a0a0a; border-right: 1px solid rgba(167,139,250,0.10); display: flex; flex-direction: column; position: fixed; top: 0; left: 0; z-index: 200; transition: transform 0.3s cubic-bezier(0.4,0,0.2,1); }
        .fan-main { margin-left: 232px; min-height: 100vh; background: #f7f7f8; display: flex; flex-direction: column; }
        .fan-topbar { background: #fff; border-bottom: 1px solid #f0f0f0; height: 60px; padding: 0 28px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; }
        .fan-content { padding: 40px 24px; }
        .fan-stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 28px; }
        .fan-hamburger { display: none; background: none; border: none; cursor: pointer; color: #7c3aed; font-size: 1.3rem; padding: 4px 8px; border-radius: 8px; }
        .fan-overlay { display: none; }
        .fan-bnav { display: none; }
        @media (max-width: 800px) {
          .fan-sidebar { transform: translateX(-100%); }
          .fan-sidebar.open { transform: translateX(0); box-shadow: 4px 0 32px rgba(0,0,0,0.3); }
          .fan-main { margin-left: 0; }
          .fan-topbar { padding: 0 18px; }
          .fan-hamburger { display: block; }
          .fan-content { padding: 24px 16px 100px; }
          .fan-overlay { display: block; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 199; }
          .fan-stat-grid { grid-template-columns: repeat(2, 1fr); }
          .fan-bnav { display: block; position: fixed; bottom: 0; left: 0; right: 0; background: #fff; border-top: 1px solid #f0f0f0; z-index: 300; padding: 8px 0 env(safe-area-inset-bottom,8px); }
          .fan-bnav-inner { display: flex; justify-content: space-around; }
          .fan-bnav-btn { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 4px 8px; border: none; background: none; cursor: pointer; color: #9ca3af; font-family: 'Outfit',sans-serif; font-size: 0.62rem; font-weight: 600; min-width: 52px; }
          .fan-bnav-btn.active { color: #f59e0b; }
        }
        @media (max-width: 420px) { .fan-stat-grid { grid-template-columns: 1fr; } }
        @media (max-width: 800px) { .fan-chat-grid { grid-template-columns: 1fr !important; } }
        .fan-input { width: 100%; padding: 12px 16px; border: 1.5px solid #e5e7eb; border-radius: 12px; font-size: 0.9rem; font-family: 'Outfit',sans-serif; outline: none; }
        .fan-input:focus { border-color: #a855f7; box-shadow: 0 0 0 3px rgba(168,85,247,0.1); }
      `}</style>

      <div className="fan-root" style={{ minHeight: "100vh" }}>

        {mobileOpen && <div className="fan-overlay" onClick={() => setMobileOpen(false)} />}

        {/* ── Sidebar ── */}
        <aside className={`fan-sidebar${mobileOpen ? " open" : ""}`}>
          <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid rgba(167,139,250,0.08)", flexShrink: 0 }}>
            <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
              <div style={{ background: "linear-gradient(135deg,#a78bfa,#7c3aed)", borderRadius: 10, width: 34, height: 34, display: "grid", placeItems: "center", fontFamily: "'Outfit',sans-serif", fontWeight: 900, color: "#fff", fontSize: "1rem", boxShadow: "0 4px 14px rgba(124,58,237,0.4)", flexShrink: 0 }}>A</div>
              <span style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: "1.08rem", color: "#fff", letterSpacing: "-0.02em" }}>AskExpert</span>
            </a>
          </div>

          {sidebarNav}
          {sidebarFooter}
        </aside>

        {/* ── Main ── */}
        <main className="fan-main">
          <header className="fan-topbar">
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <button className="fan-hamburger" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menu">☰</button>
              <a href="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
                <div style={{ background: "linear-gradient(135deg,#a78bfa,#7c3aed)", borderRadius: 9, width: 30, height: 30, display: "grid", placeItems: "center", fontFamily: "'Outfit',sans-serif", fontWeight: 900, color: "#fff", fontSize: "0.9rem", boxShadow: "0 3px 10px rgba(124,58,237,0.35)", flexShrink: 0 }}>A</div>
                <span style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: "1rem", color: "#111", letterSpacing: "-0.02em" }}>AskExpert</span>
              </a>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {username && (
                <a href={`/${username}`} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 99, border: "1.5px solid #ede9fe", background: "#fff", color: "#7c3aed", fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: "0.82rem", textDecoration: "none", whiteSpace: "nowrap" }}>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                  View Profile
                </a>
              )}
            </div>
          </header>

          <div className="fan-content">
            <div style={{ maxWidth: 980, margin: "0 auto" }}>

            {/* HOME */}
            {activeNav === "home" && (
              <>
                <div style={{ marginBottom: 24 }}>
                  <h1 style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#111", margin: "0 0 4px" }}>Welcome back, {displayName.split(" ")[0]} 👋</h1>
                  <p style={{ fontFamily: "'Outfit',sans-serif", color: "#888", fontSize: "0.9rem", margin: 0 }}>
                    Chat with the creators you subscribe to or send one-time questions from any creator&apos;s public profile.
                  </p>
                </div>

                {/* Stat row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 24 }}>
                  {statCard("Active Chats", subscriptions.length, "💬", "#f5f3ff", "#7c3aed")}
                  {statCard("One-Time Questions", questions.length, "❓", "#fffbeb", "#d97706")}
                  {statCard("Answered", answeredCount, "✅", "#ecfdf5", "#059669")}
                  {statCard("Pending", pendingCount, "⏳", "#f0f9ff", "#0369a1")}
                </div>

                {/* How-it-works tip — explains chat vs one-time */}
                <div style={{
                  background: "linear-gradient(135deg, #f5f3ff 0%, #fff 100%)",
                  border: "1px solid #ede9fe", borderRadius: 16, padding: "14px 18px",
                  marginBottom: 24, display: "flex", gap: 14, alignItems: "flex-start",
                }}>
                  <span style={{ fontSize: "1.3rem", flexShrink: 0 }}>💡</span>
                  <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: "0.85rem", color: "#4b5563", lineHeight: 1.55 }}>
                    <strong style={{ color: "#1f2937" }}>Two ways to reach a creator:</strong>
                    {" "}<span style={{ color: "#7c3aed", fontWeight: 700 }}>Subscribe</span> to chat directly (unlimited messages, files, voice notes), or
                    {" "}<span style={{ color: "#d97706", fontWeight: 700 }}>pay once</span> to send a single question from their public profile.
                  </div>
                </div>

                {/* Two-column body */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
                  {/* Left – Your Conversations (chat-first) */}
                  {card(<>
                    {sectionTitle("Your Conversations")}
                    {loading
                      ? <div style={{ textAlign: "center", padding: 40, color: "#9ca3af", fontFamily: "'Outfit',sans-serif" }}>Loading…</div>
                      : subscriptions.length === 0
                        ? emptyState("💬", "Subscribe to a creator to start chatting.", { label: "Find Creators →", nav: "discover" })
                        : <div style={{ marginTop: -8 }}>
                            {subscriptions.slice(0, 6).map((sub) => (
                              <HomeChatRow
                                key={sub.id}
                                sub={sub}
                                onOpenChat={() => { setSelectedChatSub(sub.id); go("questions"); }}
                              />
                            ))}
                          </div>
                    }
                    {subscriptions.length > 0 && (
                      <button onClick={() => go("subscriptions")} style={{ background: "none", border: "none", color: "#7c3aed", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer", paddingTop: 12, fontFamily: "'Outfit',sans-serif" }}>
                        Manage subscriptions →
                      </button>
                    )}
                  </>, { marginBottom: 0 })}

                  {/* Right – One-Time Questions */}
                  {card(<>
                    {sectionTitle("One-Time Questions")}
                    {loading
                      ? <div style={{ textAlign: "center", padding: 40, color: "#9ca3af", fontFamily: "'Outfit',sans-serif" }}>Loading…</div>
                      : questions.length === 0
                        ? <div style={{ textAlign: "center", padding: "20px 0", color: "#9ca3af" }}>
                            <div style={{ fontSize: "2.2rem", marginBottom: 10 }}>❓</div>
                            <p style={{ fontFamily: "'Outfit',sans-serif", color: "#1f2937", fontWeight: 700, margin: "0 0 4px", fontSize: "0.95rem" }}>No one-time questions yet</p>
                            <p style={{ fontFamily: "'Outfit',sans-serif", color: "#9ca3af", margin: "0 0 14px", fontSize: "0.82rem", lineHeight: 1.5 }}>
                              Pay once to ask any creator a single question — answered within their SLA.
                            </p>
                            <button onClick={() => go("discover")} style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)", border: "none", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "0.85rem", padding: "8px 20px", borderRadius: 99, fontFamily: "'Outfit',sans-serif" }}>
                              Find a Creator →
                            </button>
                          </div>
                        : <>
                            {questions.slice(0, 5).map((q) => (
                              <div key={q.id} style={{ padding: "12px 0", borderBottom: "1px solid #f3f4f6" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: q.response ? 6 : 0 }}>
                                  <p style={{ fontFamily: "'Outfit',sans-serif", color: "#374151", fontSize: "0.85rem", lineHeight: 1.55, flex: 1 }}>
                                    {q.content.length > 80 ? q.content.slice(0, 80) + "…" : q.content}
                                  </p>
                                  {statusBadge(q.status)}
                                </div>
                                {q.response && (
                                  <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "8px 12px", fontSize: "0.8rem", color: "#166534", fontFamily: "'Outfit',sans-serif" }}>
                                    <strong>Answer: </strong>{q.response.slice(0, 90)}{q.response.length > 90 ? "…" : ""}
                                  </div>
                                )}
                              </div>
                            ))}
                          </>
                    }
                  </>, { marginBottom: 0 })}
                </div>
              </>
            )}

            {/* DISCOVER */}
            {activeNav === "discover" && (
              <>
                <div style={{ marginBottom: 24 }}>
                  <h1 style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#111", margin: "0 0 4px" }}>Discover Creators</h1>
                  <p style={{ fontFamily: "'Outfit',sans-serif", color: "#888", fontSize: "0.9rem", margin: 0 }}>Visit a creator&apos;s page to subscribe or ask a question.</p>
                </div>
                {card(<>
                  {sectionTitle("Visit a Creator")}
                  <p style={{ fontFamily: "'Outfit',sans-serif", color: "#6b7280", fontSize: "0.88rem", marginBottom: 16 }}>Enter a username or full profile URL.</p>
                  <form onSubmit={handleFindCreator} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <input className="fan-input" style={{ flex: 1, minWidth: 200 }} type="text" placeholder="username  or  /username  or  full URL" value={creatorUrl} onChange={(e) => setCreatorUrl(e.target.value)} required />
                    <button type="submit" style={{ padding: "0 24px", height: 48, background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 800, fontSize: "0.9rem", cursor: "pointer", fontFamily: "'Outfit',sans-serif" }}>Go →</button>
                  </form>
                </>)}
                {card(<>
                  {sectionTitle("Subscribed Creators")}
                  {loading ? <div style={{ textAlign: "center", padding: 32, color: "#9ca3af", fontFamily: "'Outfit',sans-serif" }}>Loading…</div>
                    : subscriptions.length === 0 ? emptyState("🔍", "Subscribe to a creator to start asking questions.")
                    : <div style={{ marginTop: -8 }}>{subscriptions.map(creatorRow)}<div style={{ height: 1 }} /></div>
                  }
                </>)}
              </>
            )}

            {/* SUBSCRIPTIONS */}
            {activeNav === "subscriptions" && (
              <>
                <div style={{ marginBottom: 24 }}>
                  <h1 style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#111", margin: "0 0 4px" }}>My Subscriptions</h1>
                  <p style={{ fontFamily: "'Outfit',sans-serif", color: "#888", fontSize: "0.9rem", margin: 0 }}>{loading ? "…" : `${subscriptions.length} active ${subscriptions.length === 1 ? "subscription" : "subscriptions"}`}</p>
                </div>
                {loading ? (
                  <div style={{ textAlign: "center", padding: 60, color: "#9ca3af", fontFamily: "'Outfit',sans-serif" }}>Loading…</div>
                ) : subscriptions.length === 0 ? card(emptyState("⭐", "No active subscriptions yet.", { label: "Find Creators →", nav: "discover" }))
                  : subscriptions.map((sub) => (
                    <FanSubscriptionRow
                      key={sub.id}
                      sub={sub}
                      onOpenChat={() => { setSelectedChatSub(sub.id); go("questions"); }}
                      onManage={handleManageSubscription}
                      portalLoading={portalLoading}
                    />
                  ))
                }
              </>
            )}

            {/* QUESTIONS — two-pane chat: subscribed creators | thread */}
            {activeNav === "questions" && (() => {
              const activeSubs = subscriptions.filter((s) => s.status === "active");
              // On desktop we auto-pick the first creator so something is always
              // visible. On mobile we start with no selection so the user sees
              // the chat list first and only navigates into a thread on tap.
              const fallback = isChatMobile ? null : (activeSubs[0]?.id ?? null);
              const currentId = selectedChatSub && activeSubs.some(s => s.id === selectedChatSub) ? selectedChatSub : fallback;
              const current = activeSubs.find(s => s.id === currentId) ?? null;
              const mobileInChat = isChatMobile && current !== null;
              const showList = !isChatMobile || !mobileInChat;
              const showThread = !isChatMobile || mobileInChat;
              return (
                <>
                  {!mobileInChat && (
                    <div style={{ marginBottom: 16 }}>
                      <h1 style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#111", margin: "0 0 4px" }}>My Questions</h1>
                      <p style={{ fontFamily: "'Outfit',sans-serif", color: "#888", fontSize: "0.9rem", margin: 0 }}>
                        Chat directly with the creators you subscribe to.
                      </p>
                    </div>
                  )}

                  {loading ? (
                    <div style={{ textAlign: "center", padding: 60, color: "#9ca3af", fontFamily: "'Outfit',sans-serif" }}>Loading…</div>
                  ) : activeSubs.length === 0 ? (
                    card(
                      <div style={{ textAlign: "center", padding: "32px 0" }}>
                        <p style={{ fontSize: "2.4rem", marginBottom: 10 }}>💬</p>
                        <p style={{ fontFamily: "'Outfit',sans-serif", color: "#1f2937", fontWeight: 700, margin: "0 0 6px", fontSize: "1rem" }}>No conversations yet</p>
                        <p style={{ fontFamily: "'Outfit',sans-serif", color: "#888", margin: "0 0 14px", fontSize: "0.88rem" }}>Subscribe to a creator and you can chat with them here.</p>
                        <button onClick={() => go("discover")} style={{ background: "#7c3aed", border: "none", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "0.85rem", padding: "8px 20px", borderRadius: 99, fontFamily: "'Outfit',sans-serif" }}>Find Creators →</button>
                      </div>
                    )
                  ) : (
                    <div className="fan-chat-grid" style={{ display: "grid", gridTemplateColumns: isChatMobile ? "1fr" : "minmax(260px, 320px) 1fr", gap: 14, alignItems: "stretch" }}>
                      {showList && (
                        <aside style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 16, padding: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", maxHeight: isChatMobile ? "calc(100vh - 200px)" : 640 }}>
                          <div style={{ overflowY: "auto", flex: 1 }}>
                            {activeSubs.map((s) => (
                              <FanChatCreatorRow
                                key={s.id}
                                sub={s}
                                active={!isChatMobile && (currentId ?? null) === s.id}
                                onClick={() => setSelectedChatSub(s.id)}
                              />
                            ))}
                          </div>
                        </aside>
                      )}

                      {showThread && (
                        <section style={mobileInChat ? {
                          // Full-viewport overlay: covers the page and the
                          // bottom-nav (zIndex above .fan-bnav's 300). The
                          // only way out is the back arrow in the chat header.
                          position: "fixed",
                          top: 0, left: 0, right: 0, bottom: 0,
                          background: "#f7f7f8",
                          zIndex: 9999,
                        } : { minHeight: 480 }}>
                          {current && user ? (
                            <ChatThread
                              subscriptionId={current.id}
                              creatorId={current.creatorId}
                              followerId={user.uid}
                              viewerRole="fan"
                              counterpartName={current.creatorName || current.creatorUsername || "Creator"}
                              counterpartSubtitle={current.creatorUsername ? `@${current.creatorUsername}` : undefined}
                              counterpartInitial={(current.creatorName || current.creatorUsername || "?")[0]}
                              height={mobileInChat ? "100%" : 560}
                              onBack={isChatMobile ? () => setSelectedChatSub(null) : undefined}
                            />
                          ) : (
                            <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 16, padding: 40, textAlign: "center", color: "#9ca3af" }}>
                              Pick a creator to start chatting.
                            </div>
                          )}
                        </section>
                      )}
                    </div>
                  )}
                </>
              );
            })()}

            {/* SETTINGS */}
            {activeNav === "settings" && (
              <>
                <div style={{ marginBottom: 24 }}>
                  <h1 style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#111", margin: "0 0 4px" }}>Settings</h1>
                  <p style={{ fontFamily: "'Outfit',sans-serif", color: "#888", fontSize: "0.9rem", margin: 0 }}>Manage your fan account.</p>
                </div>
                {card(<>
                  {sectionTitle("Account")}
                  {[
                    { label: "Display Name", value: displayName },
                    { label: "Email", value: user.email },
                    { label: "Username", value: username ? `@${username}` : "—" },
                    { label: "Role", value: "Fan member" },
                  ].map((row) => (
                    <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "1px solid #f3f4f6" }}>
                      <div>
                        <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, color: "#374151", fontSize: "0.88rem", marginBottom: 2 }}>{row.label}</div>
                        <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: "0.8rem", color: "#9ca3af" }}>{row.value}</div>
                      </div>
                    </div>
                  ))}
                </>)}
                {card(<>
                  {sectionTitle("Creator Mode")}
                  <p style={{ fontFamily: "'Outfit',sans-serif", color: "#6b7280", fontSize: "0.88rem", marginBottom: 18, lineHeight: 1.6 }}>Want to earn by answering questions? Go to the Creator Dashboard to set up your profile.</p>
                  <button onClick={() => router.push("/dashboard")} style={{ background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", border: "none", padding: "10px 22px", borderRadius: 12, fontWeight: 700, fontSize: "0.88rem", cursor: "pointer", fontFamily: "'Outfit',sans-serif" }}>Go to Creator Dashboard →</button>
                </>)}
                {card(<>
                  {sectionTitle("Danger Zone")}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, color: "#374151", fontSize: "0.88rem", marginBottom: 2 }}>Sign Out</div>
                      <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: "0.8rem", color: "#9ca3af" }}>Sign out of your account on this device.</div>
                    </div>
                    <button onClick={handleLogout} style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#ef4444", borderRadius: 10, padding: "8px 18px", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer", fontFamily: "'Outfit',sans-serif" }}>Sign Out</button>
                  </div>
                </>)}
              </>
            )}

            </div>{/* /maxWidth wrapper */}
          </div>
        </main>

        {/* ── Bottom Nav (mobile) ── */}
        <nav className="fan-bnav">
          <div className="fan-bnav-inner">
            {NAV.map((item) => (
              <button key={item.id} className={`fan-bnav-btn${activeNav === item.id ? " active" : ""}`} onClick={() => go(item.id)}>
                <span style={{ fontSize: "1.2rem", display: "flex" }}>{item.icon}</span>
                {item.label.split(" ")[0]}
              </button>
            ))}
          </div>
        </nav>

      </div>
    </>
  );
}

function HomeChatRow({
  sub, onOpenChat,
}: {
  sub: Subscription;
  onOpenChat: () => void;
}) {
  const unread = useChatUnread(sub.id, "fan");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid #f3f4f6" }}>
      <div style={{ position: "relative", flexShrink: 0 }}>
        <div style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#a855f7)", display: "grid", placeItems: "center", color: "#fff", fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: "0.85rem" }}>
          {(sub.creatorName || sub.creatorUsername || "?")[0].toUpperCase()}
        </div>
        {unread > 0 && (
          <span style={{ position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 99, background: "#ef4444", color: "#fff", fontSize: "0.66rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 2px #fff" }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: "'Outfit',sans-serif", fontWeight: unread > 0 ? 800 : 700, color: "#1f2937", fontSize: "0.9rem", margin: "0 0 2px" }}>{sub.creatorName || sub.creatorUsername || sub.creatorId}</p>
        {sub.creatorUsername && <p style={{ fontFamily: "'Outfit',sans-serif", color: unread > 0 ? "#ef4444" : "#9ca3af", fontSize: "0.75rem", margin: 0, fontWeight: unread > 0 ? 700 : 400 }}>{unread > 0 ? `${unread} new message${unread > 1 ? "s" : ""}` : `@${sub.creatorUsername}`}</p>}
      </div>
      <button
        onClick={onOpenChat}
        style={{ background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", fontWeight: 700, fontSize: "0.8rem", padding: "7px 14px", border: "none", borderRadius: 10, fontFamily: "'Outfit',sans-serif", cursor: "pointer", whiteSpace: "nowrap" }}
      >
        💬 Open Chat
      </button>
    </div>
  );
}

function chatTimeAgoShort(d: Date | null): string {
  if (!d) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(diff / 3_600_000);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function FanChatCreatorRow({
  sub, active, onClick,
}: {
  sub: Subscription;
  active: boolean;
  onClick: () => void;
}) {
  const { unread, lastSnippet, lastAt, lastFromMe } = useChatPreview(sub.id, "fan");
  const name = sub.creatorName || sub.creatorUsername || "Creator";
  const hasUnread = unread > 0 && !active;
  const previewText = lastSnippet
    ? `${lastFromMe ? "You: " : ""}${lastSnippet}`
    : (sub.creatorUsername ? `@${sub.creatorUsername}` : "Start a conversation");
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        width: "100%", padding: "12px 14px", border: "none",
        background: active ? "#f5f3ff" : "transparent",
        borderRadius: 12, cursor: "pointer", textAlign: "left",
        marginBottom: 2,
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "#fafafa"; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      <div style={{ flexShrink: 0 }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", display: "grid", placeItems: "center", fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: "1rem" }}>
          {name[0].toUpperCase()}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontFamily: "'Outfit',sans-serif", fontWeight: hasUnread ? 800 : 700, color: "#1f2937", fontSize: "0.92rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flex: 1 }}>{name}</span>
          {lastAt && (
            <span style={{ fontFamily: "'Outfit',sans-serif", color: hasUnread ? "#ef4444" : "#9ca3af", fontSize: "0.7rem", fontWeight: hasUnread ? 700 : 500, flexShrink: 0 }}>
              {chatTimeAgoShort(lastAt)}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <span style={{ fontFamily: "'Outfit',sans-serif", color: hasUnread ? "#1f2937" : "#6b7280", fontSize: "0.78rem", fontWeight: hasUnread ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0 }}>
            {previewText}
          </span>
          {hasUnread && (
            <span style={{ minWidth: 18, height: 18, padding: "0 6px", borderRadius: 99, background: "#ef4444", color: "#fff", fontSize: "0.66rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function FanSubscriptionRow({
  sub, onOpenChat, onManage, portalLoading,
}: {
  sub: Subscription;
  onOpenChat: () => void;
  onManage: () => void;
  portalLoading: boolean;
}) {
  const unread = useChatUnread(sub.id, "fan");
  return (
    <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 16, padding: "20px 22px", marginBottom: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 46, height: 46, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#a855f7)", display: "grid", placeItems: "center", color: "#fff", fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: "0.95rem", flexShrink: 0 }}>
          {(sub.creatorName || sub.creatorUsername || "?")[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, color: "#1f2937", fontSize: "0.95rem", marginBottom: 2 }}>{sub.creatorName || sub.creatorUsername || sub.creatorId}</p>
          {sub.creatorUsername && <p style={{ fontFamily: "'Outfit',sans-serif", color: "#9ca3af", fontSize: "0.78rem", marginBottom: 8 }}>@{sub.creatorUsername}</p>}
          <span style={{ background: "#dcfce7", color: "#166534", borderRadius: 99, padding: "2px 10px", fontSize: "0.68rem", fontWeight: 800, fontFamily: "'Outfit',sans-serif" }}>✓ Active</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            onClick={onOpenChat}
            style={{ position: "relative", background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", padding: "8px 16px", borderRadius: 10, fontWeight: 700, fontSize: "0.8rem", fontFamily: "'Outfit',sans-serif", textAlign: "center", border: "none", whiteSpace: "nowrap", cursor: "pointer" }}
          >
            💬 Open Chat
            {unread > 0 && (
              <span style={{ position: "absolute", top: -6, right: -6, minWidth: 20, height: 20, padding: "0 6px", borderRadius: 99, background: "#ef4444", color: "#fff", fontSize: "0.7rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 2px #fff" }}>
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
          {sub.creatorUsername && (
            <a href={`/${sub.creatorUsername}`} style={{ display: "block", color: "#7c3aed", padding: "7px 16px", borderRadius: 10, fontWeight: 700, fontSize: "0.78rem", textDecoration: "none", fontFamily: "'Outfit',sans-serif", textAlign: "center", border: "1.5px solid #ede9fe", whiteSpace: "nowrap" }}>View Public Profile →</a>
          )}
          <button
            onClick={onManage}
            disabled={portalLoading}
            style={{ background: "none", color: "#6b7280", padding: "7px 16px", borderRadius: 10, fontWeight: 700, fontSize: "0.78rem", fontFamily: "'Outfit',sans-serif", textAlign: "center", border: "1.5px solid #e5e7eb", whiteSpace: "nowrap", cursor: portalLoading ? "wait" : "pointer" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#f9fafb"; (e.currentTarget as HTMLElement).style.color = "#ef4444"; (e.currentTarget as HTMLElement).style.borderColor = "#fecaca"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "none"; (e.currentTarget as HTMLElement).style.color = "#6b7280"; (e.currentTarget as HTMLElement).style.borderColor = "#e5e7eb"; }}
          >
            {portalLoading ? "Opening…" : "Manage / Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
