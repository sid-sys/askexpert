"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import {
  collection, query, where, onSnapshot, orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { FirestoreQuestion, COLLECTIONS } from "@/lib/types";
import { getPlatformFeePercent } from "@/lib/stripe";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from "recharts";

type DateRange = "7d" | "30d" | "all";
const DATE_RANGES: { label: string; val: DateRange }[] = [
  { label: "Last 7 days", val: "7d" },
  { label: "Last 30 days", val: "30d" },
  { label: "All time", val: "all" },
];
function getCutoff(r: DateRange) {
  if (r === "7d")  return new Date(Date.now() - 7  * 86400000);
  if (r === "30d") return new Date(Date.now() - 30 * 86400000);
  return null;
}

// Mock chart data removed for production testing

// ── HELPERS ────────────────────────────────────────────────────────────────
function maskEmail(email: string | undefined): string {
  if (!email) return "Anonymous";
  const [local, domain] = email.split("@");
  if (!domain) return "Anonymous";
  const head = local.slice(0, 1);
  return `${head}${"*".repeat(Math.max(1, local.length - 1))}@${domain}`;
}

function askerDisplayLabel(q: FirestoreQuestion): string {
  const name = (q as any).followerName?.trim?.();
  if (name) return name;
  return maskEmail(q.followerEmail);
}

function groupByDay(questions: FirestoreQuestion[], creatorNetRate: number) {
  const map: Record<string, { date: string; earned: number; questions: number }> = {};
  questions.forEach((q) => {
    const d = new Date(q.createdAt);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    if (!map[key]) map[key] = { date: key, earned: 0, questions: 0 };
    map[key].questions++;
    if (q.status === "ANSWERED") map[key].earned += q.pricePaid * creatorNetRate;
  });
  return Object.values(map).slice(-14);
}

const TOOLTIP_STYLE = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
  padding: "10px 14px",
  color: "#1f2937",
  fontFamily: "'Inter', sans-serif",
  fontSize: "0.85rem",
};

// ── COMPONENT ──────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { user, userProfile, loading } = useAuth();
  const router = useRouter();
  const [questions, setQuestions] = useState<FirestoreQuestion[]>([]);
  const [fetching, setFetching] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>("30d");

  useEffect(() => {
    if (!loading && !user) router.push("/auth");
  }, [user, loading, router]);

  // Live questions feed — onSnapshot keeps the charts + totals in sync the
  // moment a new question is paid, answered, or refunded. Was getDocs (single
  // snapshot on mount); analytics would otherwise show stale numbers until
  // the user manually refreshed.
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(
        collection(db, COLLECTIONS.QUESTIONS),
        where("creatorId", "==", user.uid),
        orderBy("createdAt", "asc"),
      ),
      (snap) => {
        const qs = snap.docs.map((d) => ({
          ...d.data(),
          id: d.id,
          createdAt: d.data().createdAt?.toDate?.() || new Date(),
          answeredAt: d.data().answeredAt?.toDate?.() || null,
          expiresAt: d.data().expiresAt?.toDate?.() || new Date(),
        })) as FirestoreQuestion[];
        setQuestions(qs);
        setFetching(false);
      },
      (err) => { console.error("Error fetching analytics data:", err); setFetching(false); },
    );
    return () => unsub();
  }, [user]);

  // Derived stats — filtered by date range
  const filteredQuestions = useMemo(() => {
    const cutoff = getCutoff(dateRange);
    return cutoff ? questions.filter(q => new Date(q.createdAt) >= cutoff) : questions;
  }, [questions, dateRange]);

  // Honour the creator's current plan fee instead of the legacy hard-coded
  // 0.9 multiplier. Free=15%, Creator=5%, Pro=0% — all live in lib/stripe.
  // For a precise "all-time" total we'd want the cached oneTimeNetEarnings
  // bucket (sum of net at fee-at-payment time), but here we're filtering by
  // a date range so we re-derive against today's tier.
  const platformFeePct = getPlatformFeePercent((userProfile as any)?.platformPlan ?? "free");
  const creatorNetRate = (100 - platformFeePct) / 100;

  const totalEarned    = filteredQuestions.filter(q => q.status === "ANSWERED").reduce((s, q) => s + q.pricePaid * creatorNetRate, 0);
  const totalQuestions = filteredQuestions.length;
  const answered       = filteredQuestions.filter(q => q.status === "ANSWERED").length;
  const refunded       = filteredQuestions.filter(q => q.status === "REFUNDED").length;
  const pending        = filteredQuestions.filter(q => q.status === "PENDING").length;
  const responseRate   = (totalQuestions > 0 ? Math.round((answered / totalQuestions) * 100) : 0);
  const avgResponse    = (() => {
    const withTime = filteredQuestions.filter(q => q.status === "ANSWERED" && q.answeredAt);
    if (!withTime.length) return "—";
    const avg = withTime.reduce((s, q) => s + (new Date(q.answeredAt!).getTime() - new Date(q.createdAt).getTime()), 0) / withTime.length;
    return `${Math.floor(avg / 3_600_000)}h avg`;
  })();

  const chartData = groupByDay(filteredQuestions, creatorNetRate);
  const topAskers = (() => {
    const groups: Record<string, { label: string; count: number; totalSpent: number }> = {};
    filteredQuestions.forEach(q => {
      const key = q.followerEmail || "unknown";
      if (!groups[key]) {
        groups[key] = { label: askerDisplayLabel(q), count: 0, totalSpent: 0 };
      }
      groups[key].count++;
      groups[key].totalSpent += q.pricePaid;
    });
    return Object.values(groups)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  })();

  const statusData = [
    { name: "Answered", value: answered, color: "#10b981" },
    { name: "Pending",  value: pending,  color: "#f59e0b" },
    { name: "Refunded", value: refunded, color: "#9ca3af" },
  ];

  // ── PPP Analytics ──
  const COUNTRY_META: Record<string, { flag: string; tier: string; discount: string; color: string }> = {
    IN: { flag: "🇮🇳", tier: "Tier 3", discount: "60%", color: "#10b981" },
    BR: { flag: "🇧🇷", tier: "Tier 2", discount: "40%", color: "#f59e0b" },
    MX: { flag: "🇲🇽", tier: "Tier 2", discount: "40%", color: "#f59e0b" },
    PK: { flag: "🇵🇰", tier: "Tier 3", discount: "60%", color: "#10b981" },
    NG: { flag: "🇳🇬", tier: "Tier 3", discount: "60%", color: "#10b981" },
    ID: { flag: "🇮🇩", tier: "Tier 2", discount: "40%", color: "#f59e0b" },
    BD: { flag: "🇧🇩", tier: "Tier 3", discount: "60%", color: "#10b981" },
    PH: { flag: "🇵🇭", tier: "Tier 2", discount: "40%", color: "#f59e0b" },
    EG: { flag: "🇪🇬", tier: "Tier 3", discount: "60%", color: "#10b981" },
    VN: { flag: "🇻🇳", tier: "Tier 2", discount: "40%", color: "#f59e0b" },
    CO: { flag: "🇨🇴", tier: "Tier 2", discount: "40%", color: "#f59e0b" },
    AR: { flag: "🇦🇷", tier: "Tier 2", discount: "40%", color: "#f59e0b" },
    RO: { flag: "🇷🇴", tier: "Tier 2", discount: "40%", color: "#f59e0b" },
    TR: { flag: "🇹🇷", tier: "Tier 2", discount: "40%", color: "#f59e0b" },
    Other: { flag: "🌍", tier: "Mixed", discount: "—", color: "#6b7280" },
  };

  const pppStats = useMemo(() => {
    const pppOrders = questions.filter(q => (q as any).metadata?.pppApplied === "true");
    const countries: Record<string, number> = {};
    pppOrders.forEach(q => {
      const c = (q as any).metadata?.countryCode || "Other";
      countries[c] = (countries[c] || 0) + 1;
    });

    // Rich mock if no real data removed for production
    if (pppOrders.length === 0) return [];

    const NAME_MAP: Record<string, string> = {
      IN:"India",BR:"Brazil",MX:"Mexico",PK:"Pakistan",NG:"Nigeria",
      ID:"Indonesia",BD:"Bangladesh",PH:"Philippines",EG:"Egypt",
      VN:"Vietnam",CO:"Colombia",AR:"Argentina",RO:"Romania",TR:"Turkey",
    };
    return Object.entries(countries)
      .map(([code, value]) => ({ code, name: NAME_MAP[code] || code, value }))
      .sort((a, b) => b.value - a.value);
  }, [questions]);

  const pppTotal = pppStats.reduce((s, r) => s + r.value, 0);

  const kpis = [
    { label: "Total Earned",     value: `$${(totalEarned / 100).toFixed(2)}`, color: "#7c3aed", icon: "💰" },
    { label: "Response Rate",    value: `${responseRate}%`,                    color: "#10b981", icon: "📈" },
    { label: "Avg Response Time",value: avgResponse,                           color: "#f59e0b", icon: "⚡" },
    { label: "Total Questions",  value: totalQuestions,                        color: "#1f2937", icon: "📨" },
    { label: "Answered",         value: answered,                              color: "#10b981", icon: "✅" },
    { label: "Refunded",         value: refunded,                              color: "#9ca3af", icon: "↩️" },
  ];

  if (loading || fetching) {
    return (
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "48px 24px" }}>
        <div style={{ width: 200, height: 40, background: "#f3f4f6", borderRadius: 12, marginBottom: 36 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16, marginBottom: 32 }}>
          {[1,2,3,4,5,6].map(i => <div key={i} style={{ height: 100, background: "#f3f4f6", borderRadius: 20 }} />)}
        </div>
        {[1,2].map(i => <div key={i} style={{ height: 260, background: "#f3f4f6", borderRadius: 24, marginBottom: 20 }} />)}
      </div>
    );
  }

  return (
    <div className="analytics-page" style={{ maxWidth: 960, margin: "0 auto", padding: "48px 24px" }}>

      {/* PAGE HEADER */}
      <div className="analytics-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "clamp(1.8rem, 3vw, 2.4rem)", fontWeight: 800, color: "#1f2937", marginBottom: 6 }}>
            Analytics
          </h1>
          <p style={{ fontFamily: "'Inter', sans-serif", color: "#6b7280", margin: 0 }}>
            Earnings and performance overview
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }} className="no-print">
          <button onClick={() => window.print()} style={{ padding: "0.5rem 1rem", borderRadius: 99, background: "#f3f4f6", border: "none", cursor: "pointer", fontFamily: "'Inter', sans-serif", fontWeight: 600, color: "#374151" }}>PDF Report</button>
          <button onClick={() => {
            const header = ["Date", "Asker", "Status", "Amount", "Question"];
            const rows = filteredQuestions.map(q => [
              new Date(q.createdAt).toLocaleDateString(),
              askerDisplayLabel(q),
              q.status,
              `$${(q.pricePaid / 100).toFixed(2)}`,
              `"${(q.content || "").replace(/"/g, '""')}"`
            ]);
            const csv = [header, ...rows].map(e => e.join(",")).join("\n");
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `analytics_${dateRange}.csv`;
            link.click();
          }} style={{ padding: "0.5rem 1rem", borderRadius: 99, background: "#7c3aed", border: "none", cursor: "pointer", fontFamily: "'Inter', sans-serif", fontWeight: 600, color: "#fff" }}>Export CSV</button>
        </div>
      </div>
      <style jsx>{`
        @media print {
          .no-print { display: none !important; }
        }
      `}</style>

      {/* DATE RANGE SELECTOR */}
      <div style={{ display: "flex", gap: 8, marginBottom: 32, flexWrap: "wrap" }}>
        {DATE_RANGES.map(({ label, val }) => (
          <button
            key={val}
            onClick={() => setDateRange(val)}
            style={{
              padding: "0.5rem 1.2rem",
              fontFamily: "'Inter', sans-serif",
              fontSize: "0.85rem", fontWeight: 600,
              borderRadius: "99px",
              border: `1.5px solid ${dateRange === val ? "#7c3aed" : "#e5e7eb"}`,
              background: dateRange === val ? "#7c3aed" : "#fff",
              color: dateRange === val ? "#fff" : "#6b7280",
              cursor: "pointer", transition: "all 0.2s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* KPI GRID */}
      <div className="analytics-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16, marginBottom: 32 }}>
        {kpis.map((k) => (
          <div key={k.label} style={{
            background: "#fff", border: "1px solid #e5e7eb", borderRadius: "20px",
            padding: "1.4rem", textAlign: "center",
            boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
            transition: "transform 0.2s, box-shadow 0.2s",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)";
            (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 24px rgba(0,0,0,0.08)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.transform = "";
            (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.05)";
          }}>
            <div style={{ fontSize: "1.3rem", marginBottom: 8 }}>{k.icon}</div>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "1.7rem", fontWeight: 800, color: k.color, lineHeight: 1, marginBottom: 6 }}>{k.value}</div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.72rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* EARNINGS AREA CHART */}
      <div style={{
        background: "#fff", border: "1px solid #e5e7eb", borderRadius: 24,
        padding: "2rem", marginBottom: 24, boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
      }}>
        <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "1.3rem", fontWeight: 700, color: "#1f2937", marginBottom: 20 }}>
          💰 Earnings — {DATE_RANGES.find(d => d.val === dateRange)?.label}
        </h2>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="earnGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 12, fontFamily: "Inter" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#9ca3af", fontSize: 12, fontFamily: "Inter" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 100).toFixed(0)}`} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any) => [`$${((Number(v) || 0) / 100).toFixed(2)}`, "Earned"]}
            />
            <Area type="monotone" dataKey="earned" stroke="#7c3aed" strokeWidth={2.5} fill="url(#earnGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* QUESTIONS VOLUME BAR CHART */}
      <div style={{
        background: "#fff", border: "1px solid #e5e7eb", borderRadius: 24,
        padding: "2rem", marginBottom: 24, boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
      }}>
        <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "1.3rem", fontWeight: 700, color: "#1f2937", marginBottom: 20 }}>
          📈 Questions per Day
        </h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} barSize={28}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 12, fontFamily: "Inter" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#9ca3af", fontSize: 12, fontFamily: "Inter" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="questions" fill="#7c3aed" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* PPP ANALYTICS — PREMIUM PANEL */}
      <div style={{
        background: "#fff", border: "1px solid #e5e7eb", borderRadius: 24,
        padding: "2rem", marginBottom: 24, boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "1.3rem", fontWeight: 700, color: "#1f2937", margin: 0 }}>
              🌍 Global Fair Pricing (PPP) Usage
            </h2>
            <p style={{ fontSize: "0.85rem", color: "#6b7280", marginTop: 4, marginBottom: 0 }}>
              Countries using your PPP discount to access your expertise.
            </p>
          </div>
          {/* Summary KPIs */}
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ textAlign: "center", padding: "10px 16px", background: "#f0fdf4", borderRadius: 12 }}>
              <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: "1.4rem", color: "#10b981", lineHeight: 1 }}>{pppTotal}</div>
              <div style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 600, textTransform: "uppercase", marginTop: 2 }}>PPP Orders</div>
            </div>
            <div style={{ textAlign: "center", padding: "10px 16px", background: "#f5f3ff", borderRadius: 12 }}>
              <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: "1.4rem", color: "#7c3aed", lineHeight: 1 }}>{pppStats.length}</div>
              <div style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 600, textTransform: "uppercase", marginTop: 2 }}>Countries</div>
            </div>
          </div>
        </div>

        {/* Tier legend */}
        <div style={{ display: "flex", gap: 14, marginBottom: 20, marginTop: 16 }}>
          {[
            { color: "#10b981", label: "Tier 3 — 60% off", bg: "#f0fdf4" },
            { color: "#f59e0b", label: "Tier 2 — 40% off", bg: "#fffbeb" },
            { color: "#6b7280", label: "Mixed / Other", bg: "#f9fafb" },
          ].map(t => (
            <div key={t.label} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: t.bg, borderRadius: 99 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
              <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "#374151" }}>{t.label}</span>
            </div>
          ))}
        </div>

        {/* Country rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {pppStats.map((row) => {
            const meta = COUNTRY_META[row.code] || COUNTRY_META["Other"];
            const pct = pppTotal > 0 ? Math.round((row.value / pppTotal) * 100) : 0;
            return (
              <div key={row.code}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: "1.4rem" }}>{meta.flag}</span>
                    <div>
                      <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: "0.9rem", color: "#1f2937" }}>{row.name}</span>
                      <span style={{
                        marginLeft: 8, fontSize: "0.65rem", fontWeight: 700,
                        padding: "1px 7px", borderRadius: 99,
                        background: meta.color + "18", color: meta.color,
                      }}>{meta.tier} · {meta.discount} off</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: "0.95rem", color: meta.color }}>{row.value}</span>
                    <span style={{ fontSize: "0.75rem", color: "#9ca3af", minWidth: 36, textAlign: "right" }}>{pct}%</span>
                  </div>
                </div>
                {/* Progress bar */}
                <div style={{ height: 8, background: "#f3f4f6", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{
                    width: `${pct}%`, height: "100%", borderRadius: 99,
                    background: `linear-gradient(90deg, ${meta.color}cc, ${meta.color})`,
                    transition: "width 1.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <p style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: 20, marginBottom: 0, borderTop: "1px solid #f3f4f6", paddingTop: 14 }}>
          💡 PPP discounts automatically apply for users in lower-income countries. This helps you reach a global audience while maintaining fair pricing.
        </p>
      </div>

      {/* BOTTOM ROW: Status + Top Questions */}
      <div className="analytics-bottom-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

        {/* STATUS BREAKDOWN */}
        <div style={{
          background: "#fff", border: "1px solid #e5e7eb", borderRadius: 24,
          padding: "2rem", boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
        }}>
          <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "1.2rem", fontWeight: 700, color: "#1f2937", marginBottom: 20 }}>
            🍩 Status Breakdown
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {statusData.map((s) => {
              const pct = totalQuestions > 0 ? Math.round((s.value / totalQuestions) * 100) : 0;
              return (
                <div key={s.name}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.88rem", fontWeight: 600, color: "#374151" }}>{s.name}</span>
                    <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: "0.95rem", fontWeight: 700, color: s.color }}>{s.value} ({pct}%)</span>
                  </div>
                  <div style={{ height: 8, background: "#f3f4f6", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: s.color, borderRadius: 99, transition: "width 1s ease" }} />
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 12, paddingTop: 14, borderTop: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.85rem", color: "#6b7280" }}>Response Rate</span>
              <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: "1.1rem", fontWeight: 800, color: "#10b981" }}>{responseRate}%</span>
            </div>
          </div>
        </div>

        {/* TOP ASKERS */}
        <div style={{
          background: "#fff", border: "1px solid #e5e7eb", borderRadius: 24,
          padding: "2rem", boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
        }}>
          <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "1.2rem", fontWeight: 700, color: "#1f2937", marginBottom: 20 }}>
            🏆 Top Askers
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {topAskers.map((a, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "0.75rem 1rem", background: "#fafafa", borderRadius: 12,
                border: "1px solid #f3f4f6",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.88rem", fontWeight: 600, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.75rem", color: "#9ca3af", marginTop: 2 }}>{a.count} questions asked</div>
                </div>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "1rem", fontWeight: 800, color: "#7c3aed", marginLeft: 12, whiteSpace: "nowrap" }}>
                  ${(a.totalSpent / 100).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* EARNINGS SUMMARY BOX */}
      <div style={{
        marginTop: 24,
        background: "#7c3aed",
        borderRadius: 24,
        padding: "2rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 16,
        color: "#fff",
      }}>
        <div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.85rem", opacity: 0.8, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Total Lifetime Earnings</div>
          <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "2.8rem", fontWeight: 800, lineHeight: 1 }}>
            ${(totalEarned / 100).toFixed(2)}
          </div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.88rem", opacity: 0.75, marginTop: 6 }}>
            From {answered} answered questions · {responseRate}% response rate
          </div>
        </div>
        <a href="/profile" style={{
          background: "#fff", color: "#7c3aed", borderRadius: "99px",
          padding: "0.85rem 1.8rem", fontFamily: "'Inter', sans-serif",
          fontWeight: 700, fontSize: "0.95rem", textDecoration: "none",
          transition: "opacity 0.2s",
        }}>
          Withdrawal Settings →
        </a>
      </div>

    </div>
  );
}
