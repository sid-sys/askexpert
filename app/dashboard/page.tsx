"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  FirestoreQuestion, COLLECTIONS, QuestionStatus,
  QuestionCategory, CATEGORY_LABELS,
} from "@/lib/types";
import QuestionCard from "@/components/QuestionCard";
import Swal from "sweetalert2";
import { requestNotificationPermission } from "@/lib/fcm";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";

// Mock data removed for production testing

// ── Constants ─────────────────────────────────────────────────────────────
const STATUS_TABS: { label: string; status: QuestionStatus | "ALL" }[] = [
  { label: "All", status: "ALL" },
  { label: "⏳ Pending", status: "PENDING" },
  { label: "✅ Answered", status: "ANSWERED" },
  { label: "↩ Refunded", status: "REFUNDED" },
];

const CATEGORIES: (QuestionCategory | "all")[] = [
  "all", "business", "tech", "finance", "health", "career", "relationships", "other",
];

type SortOption = "newest" | "oldest" | "price_high" | "price_low";
type DateRange = "all" | "7d" | "30d";

function getDateCutoff(range: DateRange): Date | null {
  if (range === "7d") return new Date(Date.now() - 7 * 86400000);
  if (range === "30d") return new Date(Date.now() - 30 * 86400000);
  return null;
}

const S = {
  container: { maxWidth: 980, margin: "0 auto", padding: "40px 24px" } as React.CSSProperties,
  pill: (active: boolean): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "0.45rem 1.1rem",
    fontFamily: "'Outfit', sans-serif",
    fontSize: "0.84rem",
    fontWeight: 600,
    borderRadius: "99px",
    border: "none",
    cursor: "pointer",
    transition: "all 0.18s",
    background: active ? "#7c3aed" : "#f3f4f6",
    color: active ? "#fff" : "#6b7280",
    whiteSpace: "nowrap" as const,
  }),
  statCard: {
    background: "#fff",
    border: "1px solid #f0f0f0",
    borderRadius: "16px",
    padding: "20px",
    display: "flex",
    alignItems: "center",
    gap: 14,
    boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
    transition: "box-shadow 0.2s, transform 0.2s",
  },
};

export default function DashboardPage() {
  const { user, userProfile, loading } = useAuth();
  const router = useRouter();

  const [questions, setQuestions] = useState<FirestoreQuestion[]>([]);
  const [fetching, setFetching] = useState(true);

  // Filters
  const [tab, setTab] = useState<QuestionStatus | "ALL">("ALL");
  const [category, setCategory] = useState<QuestionCategory | "all">("all");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [sort, setSort] = useState<SortOption>("newest");

  useEffect(() => {
    if (!loading && !user) router.push("/auth");
  }, [user, loading, router]);

  // ── Email verification gate ────────────────────────────────────────────
  // Google users are always verified; email/password users must verify first
  const needsVerification = user && !user.emailVerified && user.providerData[0]?.providerId === "password";

  useEffect(() => {
    if (!user) return;
    setFetching(true);
    const q = query(
      collection(db, COLLECTIONS.QUESTIONS),
      where("creatorId", "==", user.uid),
      orderBy("createdAt", "desc")
    );
    // onSnapshot reads from IndexedDB cache first (instant), then network
    const unsub = onSnapshot(q, (snap) => {
      const qs = snap.docs.map((d) => {
        const data = d.data();
        return {
          ...data, id: d.id,
          createdAt: data.createdAt?.toDate?.() || new Date(),
          answeredAt: data.answeredAt?.toDate?.() || null,
          expiresAt: data.expiresAt?.toDate?.() || new Date(),
        } as FirestoreQuestion;
      });
      setQuestions(qs);
      setFetching(false);
    }, () => {
      setQuestions([]);
      setFetching(false);
    });
    return () => unsub();
  }, [user]);

  // FETCH VACATION LEADS
  const [vacationLeads, setVacationLeads] = useState<any[]>([]);
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, COLLECTIONS.VACATION_SUBSCRIPTIONS),
      where("creatorId", "==", user.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      setVacationLeads(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    }, (err) => {
      console.error("❌ [dashboard] Vacation leads listener failed:", err);
      setVacationLeads([]);
    });
    return () => unsub();
  }, [user]);

  // ── Auto-trigger refund cron removed — handled by server-side cron only ─────


  // ── Derived: filtered + sorted ────────────────────────────────────────────
  const filtered = useMemo(() => {
    const cutoff = getDateCutoff(dateRange);
    return questions
      .filter((q) => tab === "ALL" || q.status === tab)
      .filter((q) => category === "all" || q.category === category)
      .filter((q) => !cutoff || q.createdAt >= cutoff)
      .sort((a, b) => {
        if (sort === "newest") return b.createdAt.getTime() - a.createdAt.getTime();
        if (sort === "oldest") return a.createdAt.getTime() - b.createdAt.getTime();
        if (sort === "price_high") return b.pricePaid - a.pricePaid;
        if (sort === "price_low") return a.pricePaid - b.pricePaid;
        return 0;
      });
  }, [questions, tab, category, dateRange, sort]);

  const stats = {
    pending: questions.filter((q) => q.status === "PENDING").length,
    answered: questions.filter((q) => q.status === "ANSWERED").length,
    earned: questions.filter((q) => q.status === "ANSWERED").reduce((s, q) => s + q.pricePaid * 0.9, 0),
    total: questions.length,
    newCount: questions.filter((q) => q.isNew).length,
    vacationLeadsCount: vacationLeads.length,
    vacationConversions: questions.filter(q => (q as any).isVacationConversion).length,
  };

  // ── Push Notifications ───────────────────────────────────────────────────
  const [showNotifyBanner, setShowNotifyBanner] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        setShowNotifyBanner(true);
      }
    }
  }, []);

  const handleEnableNotifications = async () => {
    const token = await requestNotificationPermission();
    if (token && user) {
      try {
        await updateDoc(doc(db, COLLECTIONS.USERS, user.uid), {
          fcmTokens: arrayUnion(token),
        });
        setShowNotifyBanner(false);
        Swal.fire({
          title: "Notifications Enabled! 🔔",
          text: "You'll now get real-time alerts for new questions.",
          icon: "success",
          toast: true,
          position: "top-end",
          timer: 3000,
          showConfirmButton: false,
        });
      } catch (err) {
        console.error("Error saving FCM token:", err);
      }
    }
  };

  const displayName = userProfile?.displayName || "Expert";

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

  // ── Vacation Mode quick-toggle & settings ────────────────────────────────
  const [vacationMode, setVacationMode] = useState<boolean>(false);
  const [vacationSaving, setVacationSaving] = useState(false);
  const [vacationUntil, setVacationUntil] = useState<Date | null>(null);
  const [vacationMessage, setVacationMessage] = useState("");

  // Sync from profile once loaded
  useEffect(() => {
    if (userProfile?.vacationMode !== undefined) {
      setVacationMode(userProfile.vacationMode);
    }
    if (userProfile?.vacationMessage !== undefined) {
      setVacationMessage(userProfile.vacationMessage || "");
    }
    if (userProfile?.vacationUntil) {
      setVacationUntil((userProfile.vacationUntil as any).toDate ? (userProfile.vacationUntil as any).toDate() : new Date(userProfile.vacationUntil));
    } else {
      setVacationUntil(null);
    }
  }, [userProfile]);

  const saveVacationSetting = async (field: "vacationMessage" | "vacationUntil", value: any) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, COLLECTIONS.USERS, user.uid), { [field]: value });
    } catch (err) {
      console.error(`Failed to save ${field}:`, err);
    }
  };

  const handleToggleVacation = async () => {
    if (!user) return;
    const next = !vacationMode;
    setVacationSaving(true);
    setVacationMode(next);
    try {
      await updateDoc(doc(db, COLLECTIONS.USERS, user.uid), { vacationMode: next });
      Swal.fire({
        icon: next ? 'info' : 'success',
        title: next ? '🏖️ Vacation Mode ON' : '🏠 Welcome Back!',
        text: next
          ? 'New questions are paused. Turn off anytime to resume.'
          : 'You are now accepting new questions again!',
        timer: 2500,
        showConfirmButton: false,
        toast: true,
        position: 'top-end',
        timerProgressBar: true,
      });
    } catch (err) {
      setVacationMode(!next); // revert on error
      console.error('Vacation toggle failed:', err);
    } finally {
      setVacationSaving(false);
    }
  };

  if (loading || (fetching && questions.length === 0)) {
    return (
      <div style={{ background: "#f7f7f8", minHeight: "100vh" }}>
        <div style={S.container}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 28 }}>
            {[1,2,3,4].map(i => <div key={i} style={{ height: 90, background: "#ededee", borderRadius: 16 }} />)}
          </div>
          {[1,2,3].map(i => <div key={i} style={{ height: 120, background: "#ededee", borderRadius: 16, marginBottom: 14 }} />)}
        </div>
      </div>
    );
  }

  // Email verification wall
  if (needsVerification) {
    return (
      <div style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 440, textAlign: "center", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: "40px 32px", boxShadow: "0 4px 24px rgba(0,0,0,0.07)" }}>
          <div style={{ fontSize: "3rem", marginBottom: 16 }}>📧</div>
          <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "1.6rem", fontWeight: 800, color: "#1f2937", marginBottom: 12 }}>
            Verify your email
          </h2>
          <p style={{ color: "#6b7280", lineHeight: 1.6, marginBottom: 24 }}>
            We sent a verification link to <strong style={{ color: "#7c3aed" }}>{user?.email}</strong>.
            Click it to unlock your dashboard.
          </p>
          <div style={{ background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 12, padding: "12px 16px", marginBottom: 20 }}>
            <p style={{ color: "#92400e", fontSize: "0.82rem", fontWeight: 600, margin: 0 }}>
              💡 Check your spam folder if you don&apos;t see it.
            </p>
          </div>
          <button
            onClick={async () => { await user?.reload(); window.location.reload(); }}
            style={{ width: "100%", padding: "13px 0", background: "linear-gradient(135deg, #7c3aed, #a855f7)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 800, fontSize: "0.95rem", cursor: "pointer", marginBottom: 12 }}
          >
            I&apos;ve verified — Refresh
          </button>
          <button
            onClick={async () => { if (user) { const { sendEmailVerification } = await import("firebase/auth"); await sendEmailVerification(user); alert("Sent! Check your inbox."); } }}
            style={{ background: "none", border: "none", color: "#7c3aed", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer" }}
          >
            Resend verification email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-page" style={{ background: "#f7f7f8", minHeight: "100vh" }}>
      <div style={S.container}>
      {/* NOTIFICATION BANNER */}
      {showNotifyBanner && (
        <div style={{
          background: "linear-gradient(90deg, #7c3aed, #a855f7)",
          borderRadius: "16px",
          padding: "16px 24px",
          marginBottom: "32px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          color: "#fff",
          boxShadow: "0 10px 25px -5px rgba(124, 58, 237, 0.3)",
          animation: "slideDown 0.5s ease-out"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <span style={{ fontSize: "1.5rem" }}>🔔</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: "1rem" }}>Don't miss a single question!</div>
              <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>Enable browser notifications to get real-time alerts when you earn money.</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <button 
              onClick={() => setShowNotifyBanner(false)}
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", padding: "8px 16px", borderRadius: "99px", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer" }}
            >
              Later
            </button>
            <button 
              onClick={handleEnableNotifications}
              style={{ background: "#fff", color: "#7c3aed", border: "none", padding: "8px 20px", borderRadius: "99px", fontSize: "0.85rem", fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
            >
              Enable Now
            </button>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "clamp(1.5rem,3vw,2rem)", fontWeight: 800, color: "#111", margin: 0 }}>
            Welcome back, {displayName} 👋
          </h1>
          {stats.newCount > 0 && (
            <span style={{ background: "#7c3aed", color: "#fff", borderRadius: 99, padding: "3px 10px", fontSize: "0.72rem", fontWeight: 800 }}>
              {stats.newCount} NEW
            </span>
          )}
        </div>
        <p style={{ fontFamily: "'Outfit', sans-serif", color: "#888", fontSize: "0.9rem", margin: 0 }}>
          Here&apos;s what&apos;s happening with your questions today.
        </p>
      </div>

      {/* STAT CARDS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total Questions", value: stats.total, color: "#111", icon: "📨", bg: "#f0edff" },
          { label: "Pending", value: stats.pending, color: "#d97706", icon: "⏳", bg: "#fffbeb" },
          { label: "Answered", value: stats.answered, color: "#059669", icon: "✅", bg: "#ecfdf5" },
          { label: "Earned", value: `$${(stats.earned/100).toFixed(2)}`, color: "#7c3aed", icon: "💰", bg: "#f5f3ff" },
          { label: "Vacation ROI", value: `${stats.vacationConversions}/${stats.vacationLeadsCount}`, color: "#d97706", icon: "🏖️", bg: "#fffbeb" },
        ].map((s) => (
          <div key={s.label} style={S.statCard}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(124,58,237,0.1)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.04)"; (e.currentTarget as HTMLElement).style.transform = ""; }}
          >
            <div style={{ width: 42, height: 42, borderRadius: 12, background: s.bg, display: "grid", placeItems: "center", fontSize: "1.2rem", flexShrink: 0 }}>{s.icon}</div>
            <div>
              <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "1.5rem", fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "0.72rem", fontWeight: 600, color: "#999", marginTop: 3 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* VACATION MODE */}
      <div style={{
        marginBottom: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        background: vacationMode ? "#fffbeb" : "#fff",
        border: `1px solid ${vacationMode ? "#fde68a" : "#f0f0f0"}`,
        borderRadius: 16,
        padding: "16px 20px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        transition: "all 0.3s ease",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: vacationMode ? "#fef3c7" : "#f5f3ff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "1.4rem", flexShrink: 0,
            border: vacationMode ? "1.5px solid #fde68a" : "1.5px solid #ddd6fe",
          }}>
            {vacationMode ? "🏖️" : "🏠"}
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: "0.95rem", color: vacationMode ? "#92400e" : "#1f2937", fontFamily: "'Outfit', sans-serif" }}>
              {vacationMode ? "Vacation Mode — ON" : "Availability"}
            </div>
            <div style={{ fontSize: "0.8rem", color: vacationMode ? "#b45309" : "#6b7280", marginTop: 2 }}>
              {vacationMode
                ? "New questions are paused. Turn off to resume."
                : "You are currently accepting new questions."}
            </div>
          </div>
        </div>
        {/* Toggle Switch */}
        <button
          onClick={handleToggleVacation}
          disabled={vacationSaving}
          aria-label={vacationMode ? "Turn off vacation mode" : "Turn on vacation mode"}
          style={{
            position: "relative",
            width: 52,
            height: 28,
            borderRadius: 99,
            border: "none",
            background: vacationMode ? "#f59e0b" : "#d1d5db",
            cursor: vacationSaving ? "wait" : "pointer",
            transition: "background 0.25s ease",
            flexShrink: 0,
            padding: 0,
          }}
        >
          <span style={{
            position: "absolute",
            top: 3,
            left: vacationMode ? 26 : 3,
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 2px 6px rgba(0,0,0,0.18)",
            transition: "left 0.25s cubic-bezier(0.4,0,0.2,1)",
            display: "block",
          }} />
        </button>

        {/* EXPANDED VACATION SETTINGS */}
        {vacationMode && (
          <div style={{ 
            width: "100%", 
            marginTop: 16,
            paddingTop: 16,
            borderTop: "1px dashed #fbbf24",
            animation: "animate__animated animate__fadeIn",
            display: "flex", flexDirection: "column", gap: 16
          }}>
            <div>
              <label style={{ display: "block", color: "var(--muted)", fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>
                When will you be back?
              </label>
              <input 
                type="date" 
                className="input-brutal"
                style={{ width: "100%", maxWidth: 300 }}
                value={vacationUntil ? vacationUntil.toISOString().split('T')[0] : ""}
                onChange={(e) => {
                  const val = e.target.value;
                  const date = val ? new Date(val) : null;
                  setVacationUntil(date);
                  saveVacationSetting("vacationUntil", date);
                }}
              />
              <p style={{ color: "var(--muted)", fontSize: "0.75rem", marginTop: 4 }}>
                Users will see this date on your profile. The "Ask" button will be disabled until you turn this off.
              </p>
            </div>

            <div>
              <label style={{ display: "block", color: "var(--muted)", fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>
                Custom Vacation Message
              </label>
              <textarea 
                className="input-brutal textarea-brutal" 
                value={vacationMessage} 
                onChange={e => setVacationMessage(e.target.value)}
                onBlur={() => saveVacationSetting("vacationMessage", vacationMessage)}
                placeholder="e.g. I'm taking a short break to recharge! Will get back to all your questions as soon as I'm back on the date above." 
                style={{ minHeight: 80, fontSize: "0.9rem", width: "100%" }}
                maxLength={200}
              />
              <p style={{ color: "var(--muted)", fontSize: "0.75rem", marginTop: 4 }}>
                {vacationMessage.length}/200 characters. Auto-saves when you click away.
              </p>
            </div>

            {/* SMART PREVIEW */}
            <div style={{ marginTop: 8 }}>
              <label style={{ display: "block", color: "#92400e", fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>
                ✨ Live Preview (How fans see it)
              </label>
              <div style={{
                background: "linear-gradient(135deg, #fef3c7 0%, #fffbeb 100%)",
                border: "2px solid #fbbf24",
                borderRadius: 20,
                padding: "20px",
                textAlign: "center",
                boxShadow: "0 6px 20px rgba(251,191,36,0.12)",
              }}>
                <div style={{ fontSize: "1.8rem", marginBottom: 8 }}>🌴</div>
                <h3 style={{ margin: 0, color: "#92400e", fontSize: "1.1rem", fontWeight: 800 }}>
                  Creator is on Vacation
                </h3>
                <p style={{ margin: "6px 0 0", color: "#b45309", fontSize: "0.85rem", fontWeight: 600, lineHeight: 1.4 }}>
                  {vacationMessage || `${displayName || "The Creator"} is taking a break and not accepting new questions right now.`}
                </p>
                {vacationUntil && (
                  <div style={{ 
                    marginTop: 12, 
                    display: "inline-block",
                    padding: "4px 12px", 
                    background: "#fbbf24", 
                    color: "#fff", 
                    borderRadius: 99,
                    fontSize: "0.75rem",
                    fontWeight: 800
                  }}>
                    📅 Expected back: {vacationUntil.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FILTER BAR */}
      <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 16, padding: "16px 20px", marginBottom: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>

        {/* Status tabs */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {STATUS_TABS.map((t) => (
            <button key={t.status} onClick={() => setTab(t.status)} style={S.pill(tab === t.status)}>
              {t.label}
              {t.status === "PENDING" && stats.pending > 0 && (
                <span style={{ background: tab === "PENDING" ? "rgba(255,255,255,0.25)" : "#ede9fe", color: tab === "PENDING" ? "#fff" : "#7c3aed", borderRadius: 99, padding: "1px 7px", fontSize: "0.72rem", fontWeight: 800 }}>
                  {stats.pending}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Second row: Category + Date + Sort */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          {/* Category */}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as QuestionCategory | "all")}
            style={{
              border: "1.5px solid #e5e7eb", borderRadius: 99, padding: "0.45rem 1rem",
              fontFamily: "'Inter', sans-serif", fontSize: "0.85rem", fontWeight: 600,
              color: "#374151", background: "#fff", cursor: "pointer", outline: "none",
              appearance: "auto",
            }}
          >
            <option value="all">📁 All Categories</option>
            {(Object.keys(CATEGORY_LABELS) as QuestionCategory[]).map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>

          {/* Date range */}
          <div style={{ display: "flex", gap: 6 }}>
            {([
              { label: "All time", val: "all" },
              { label: "Last 7d", val: "7d" },
              { label: "Last 30d", val: "30d" },
            ] as { label: string; val: DateRange }[]).map(({ label, val }) => (
              <button key={val} onClick={() => setDateRange(val)} style={S.pill(dateRange === val)}>
                {label}
              </button>
            ))}
          </div>

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            style={{
              border: "1.5px solid #e5e7eb", borderRadius: 99, padding: "0.45rem 1rem",
              fontFamily: "'Inter', sans-serif", fontSize: "0.85rem", fontWeight: 600,
              color: "#374151", background: "#fff", cursor: "pointer", outline: "none",
              appearance: "auto", marginLeft: "auto",
            }}
          >
            <option value="newest">↓ Newest first</option>
            <option value="oldest">↑ Oldest first</option>
            <option value="price_high">💰 Highest price</option>
            <option value="price_low">💸 Lowest price</option>
          </select>

          {/* Results count */}
          <span style={{ fontFamily: "'Inter', sans-serif", color: "#9ca3af", fontSize: "0.82rem", whiteSpace: "nowrap" }}>
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* QUESTION LIST */}
      {filtered.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 16, textAlign: "center", padding: "48px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <p style={{ fontSize: "2rem", marginBottom: 10 }}>📭</p>
          <p style={{ fontFamily: "'Outfit', sans-serif", color: "#999", margin: 0, fontSize: "0.92rem" }}>No questions match these filters.</p>
          <button
            onClick={() => { setTab("ALL"); setCategory("all"); setDateRange("all"); setSort("newest"); }}
            style={{ marginTop: 14, background: "#7c3aed", border: "none", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "0.85rem", padding: "8px 20px", borderRadius: 99, fontFamily: "'Outfit', sans-serif" }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              onAnswered={() =>
                setQuestions((prev) =>
                  prev.map((p) => p.id === q.id ? { ...p, status: "ANSWERED", isNew: false } : p)
                )
              }
            />
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
