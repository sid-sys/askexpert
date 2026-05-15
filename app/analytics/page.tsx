"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import {
  collection, query, where, onSnapshot, orderBy, doc, getDoc, getDocs, limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { FirestoreQuestion, COLLECTIONS } from "@/lib/types";

interface SubscriberRow {
  id: string;
  followerId: string | null;
  followerEmail: string;
  followerName: string | null;
  status: "active" | "canceled" | "past_due" | string;
  pricePerMonth: number;
  currency: string;
  createdAt: Date;
  cancelledAt: Date | null;
}

function subscriberDisplayLabel(s: SubscriberRow, nameLookup: Record<string, string>): string {
  const inline = s.followerName?.trim?.();
  if (inline) return inline;
  if (s.followerId && nameLookup[s.followerId]) return nameLookup[s.followerId];
  const emailKey = (s.followerEmail || "").toLowerCase();
  if (emailKey && nameLookup[emailKey]) return nameLookup[emailKey];
  return "Anonymous Fan";
}
import { getPlatformFeePercent } from "@/lib/stripe";
import { formatMoney, getCurrencySymbol } from "@/lib/money";
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
// `nameLookup` is a uid → displayName cache populated by a separate effect
// that reads the users collection for any fans whose name wasn't snapshotted
// on the question / subscription doc. Falls back to "Anonymous Fan" only if
// neither source has a usable name.
function askerDisplayLabel(q: FirestoreQuestion, nameLookup: Record<string, string>): string {
  const inline = (q as any).followerName?.trim?.();
  if (inline) return inline;
  const uid = (q as any).followerUid as string | undefined | null;
  if (uid && nameLookup[uid]) return nameLookup[uid];
  const emailKey = (q.followerEmail || "").toLowerCase();
  if (emailKey && nameLookup[emailKey]) return nameLookup[emailKey];
  return "Anonymous Fan";
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
  const [subscribers, setSubscribers] = useState<SubscriberRow[]>([]);
  const [nameLookup, setNameLookup] = useState<Record<string, string>>({});
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

  // Live subscriptions feed — same onSnapshot pattern as questions so the
  // MRR / active-subscriber counts stay accurate as fans subscribe or churn.
  // We do not orderBy here because some legacy docs may be missing
  // `createdAt`; we sort client-side after mapping.
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(
        collection(db, COLLECTIONS.SUBSCRIPTIONS),
        where("creatorId", "==", user.uid),
      ),
      (snap) => {
        const subs: SubscriberRow[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            followerId:    data.followerId ?? null,
            followerEmail: data.followerEmail ?? "",
            followerName:  data.followerName ?? null,
            status:        data.status ?? "active",
            pricePerMonth: data.pricePerMonth ?? 0,
            currency:      data.currency ?? "usd",
            createdAt:     data.createdAt?.toDate?.() ?? new Date(),
            cancelledAt:   data.cancelledAt?.toDate?.() ?? null,
          };
        });
        setSubscribers(subs);
      },
      (err) => { console.error("Error fetching subscribers:", err); },
    );
    return () => unsub();
  }, [user]);

  // Resolve missing fan names from the users collection. We only look up
  // fans whose name wasn't snapshotted onto the question / subscription doc.
  // Two lookup paths:
  //   • by uid    — fast direct getDoc when we have the fan's account id
  //   • by email  — single-field `where("email","==",x)` query for legacy /
  //                 guest-checkout docs that never stored the uid
  // The result is cached into `nameLookup` keyed by uid AND lowercased
  // email, so subsequent renders never re-query for the same fan, and
  // emails never reach the UI (we resolve them into names here).
  useEffect(() => {
    const missingUids   = new Set<string>();
    const missingEmails = new Set<string>();
    questions.forEach(q => {
      const inline = (q as any).followerName?.trim?.();
      if (inline) return;
      const uid = (q as any).followerUid as string | null | undefined;
      if (uid && !nameLookup[uid]) { missingUids.add(uid); return; }
      const email = (q.followerEmail || "").toLowerCase();
      if (email && !nameLookup[email]) missingEmails.add(email);
    });
    subscribers.forEach(s => {
      const inline = s.followerName?.trim?.();
      if (inline) return;
      if (s.followerId && !nameLookup[s.followerId]) { missingUids.add(s.followerId); return; }
      const email = (s.followerEmail || "").toLowerCase();
      if (email && !nameLookup[email]) missingEmails.add(email);
    });
    if (missingUids.size === 0 && missingEmails.size === 0) return;

    let cancelled = false;
    (async () => {
      const updates: Record<string, string> = {};

      // Direct uid lookups (parallel)
      await Promise.all(Array.from(missingUids).map(async (uid) => {
        try {
          const snap = await getDoc(doc(db, COLLECTIONS.USERS, uid));
          if (!snap.exists()) return;
          const data = snap.data() as any;
          const name = (data.displayName?.trim?.() || data.username?.trim?.()) as string | undefined;
          if (name) {
            updates[uid] = name;
            // Also key by email so future renders that only have the email
            // hit the cache directly.
            const e = (data.email || "").toLowerCase();
            if (e) updates[e] = name;
          }
        } catch { /* ignore */ }
      }));

      // Email-based lookups for guest / legacy docs (parallel, single-field
      // where + limit(1) so we don't pull the whole users collection).
      await Promise.all(Array.from(missingEmails).map(async (email) => {
        try {
          const snap = await getDocs(query(
            collection(db, COLLECTIONS.USERS),
            where("email", "==", email),
            limit(1),
          ));
          if (snap.empty) return;
          const data = snap.docs[0].data() as any;
          const name = (data.displayName?.trim?.() || data.username?.trim?.()) as string | undefined;
          if (name) updates[email] = name;
        } catch { /* ignore */ }
      }));

      if (!cancelled && Object.keys(updates).length > 0) {
        setNameLookup(prev => ({ ...prev, ...updates }));
      }
    })();
    return () => { cancelled = true; };
  }, [questions, subscribers, nameLookup]);

  // Derived stats — filtered by date range
  const filteredQuestions = useMemo(() => {
    const cutoff = getCutoff(dateRange);
    return cutoff ? questions.filter(q => new Date(q.createdAt) >= cutoff) : questions;
  }, [questions, dateRange]);

  // Honour the creator's current plan fee instead of the legacy hard-coded
  // 0.9 multiplier. Free=20%, Creator=10%, Pro=0% — all live in lib/stripe.
  // For a precise "all-time" total we'd want the cached oneTimeNetEarnings
  // bucket (sum of net at fee-at-payment time), but here we're filtering by
  // a date range so we re-derive against today's tier.
  const platformFeePct = getPlatformFeePercent((userProfile as any)?.platformPlan ?? "free");
  const creatorNetRate = (100 - platformFeePct) / 100;
  // Display every money value in the creator's chosen currency. Amounts in
  // Firestore are minor units (cents/paise) — same x100 convention regardless
  // of currency, so formatMoney just swaps the symbol.
  const creatorCurrency: string = (userProfile as any)?.currency ?? "usd";
  const sym = getCurrencySymbol(creatorCurrency);

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
        groups[key] = { label: askerDisplayLabel(q, nameLookup), count: 0, totalSpent: 0 };
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

  // ── Subscriber stats ──────────────────────────────────────────────────────
  // MRR uses the creator's *current* fee tier (same approach as `totalEarned`).
  // Lifetime / new / cancelled are filtered by the chosen date range against
  // createdAt and cancelledAt respectively. Top subscribers are ranked by
  // tenure (days subscribed) since we don't store per-subscriber payment
  // history client-side.
  const cutoff = getCutoff(dateRange);
  const inRange = (d: Date | null | undefined) => !!d && (!cutoff || d >= cutoff);

  const activeSubscribers   = subscribers.filter(s => s.status === "active");
  const mrrGross            = activeSubscribers.reduce((sum, s) => sum + (s.pricePerMonth || 0), 0);
  const mrrNet              = mrrGross * creatorNetRate;
  const lifetimeSubscribers = subscribers.length;
  const newSubsInRange      = subscribers.filter(s => inRange(s.createdAt)).length;
  const cancelledInRange    = subscribers.filter(s => s.status === "canceled" && inRange(s.cancelledAt)).length;

  // Lifetime earnings — combines net from questions + subscriptions. We
  // prefer the cached buckets on the user doc (they accumulate at the fee
  // tier active at each payment, so they stay correct across plan changes);
  // when those are missing on older accounts we estimate against the
  // current fee rate so the box never shows $0 misleadingly.
  const profile = (userProfile as any) ?? {};
  const lifetimeOneTimeNet      = typeof profile.oneTimeNetEarnings === "number"
    ? profile.oneTimeNetEarnings
    : questions.filter(q => q.status === "ANSWERED").reduce((s, q) => s + q.pricePaid * creatorNetRate, 0);
  const lifetimeSubscriptionNet = typeof profile.subscriptionNetEarnings === "number"
    ? profile.subscriptionNetEarnings
    : 0;
  const lifetimeTotalNet        = lifetimeOneTimeNet + lifetimeSubscriptionNet;

  const topSubscribers = [...activeSubscribers]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()) // oldest first → longest-tenured
    .slice(0, 5)
    .map(s => {
      const days = Math.max(0, Math.floor((Date.now() - s.createdAt.getTime()) / 86_400_000));
      const months = Math.max(1, Math.round(days / 30));
      // Approximate lifetime contribution: months active × monthly price.
      const approxSpent = months * (s.pricePerMonth || 0);
      return {
        id: s.id,
        label: subscriberDisplayLabel(s, nameLookup),
        days,
        pricePerMonth: s.pricePerMonth,
        approxSpent,
      };
    });

  const kpis = [
    { label: "Total Earned",     value: formatMoney(totalEarned, creatorCurrency), color: "#7c3aed", icon: "💰" },
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
              askerDisplayLabel(q, nameLookup),
              q.status,
              formatMoney(q.pricePaid, creatorCurrency),
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
            <YAxis tick={{ fill: "#9ca3af", fontSize: 12, fontFamily: "Inter" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${sym}${(v / 100).toFixed(0)}`} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any) => [formatMoney(Number(v) || 0, creatorCurrency), "Earned"]}
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

      {/* SUBSCRIBERS PANEL */}
      <div style={{
        background: "#fff", border: "1px solid #e5e7eb", borderRadius: 24,
        padding: "2rem", marginBottom: 24, boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "1.3rem", fontWeight: 700, color: "#1f2937", margin: 0 }}>
              🌟 Subscribers
            </h2>
            <p style={{ fontSize: "0.85rem", color: "#6b7280", marginTop: 4, marginBottom: 0 }}>
              Monthly recurring revenue and active fans subscribed to you.
            </p>
          </div>
        </div>

        {/* Subscriber KPI row */}
        <div className="analytics-sub-kpis" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Active Subscribers", value: activeSubscribers.length, color: "#7c3aed", icon: "👥" },
            { label: "MRR (You Receive)",  value: formatMoney(mrrNet, creatorCurrency), color: "#10b981", icon: "💰" },
            { label: `New (${DATE_RANGES.find(d => d.val === dateRange)?.label.toLowerCase()})`,
                                            value: newSubsInRange,           color: "#1f2937", icon: "➕" },
            { label: "Cancelled (period)", value: cancelledInRange,          color: "#9ca3af", icon: "↩️" },
            { label: "Lifetime Subs",      value: lifetimeSubscribers,       color: "#f59e0b", icon: "📈" },
          ].map(k => (
            <div key={k.label} style={{
              background: "#fafafa", border: "1px solid #f3f4f6", borderRadius: 16,
              padding: "1rem", textAlign: "center",
            }}>
              <div style={{ fontSize: "1.1rem", marginBottom: 4 }}>{k.icon}</div>
              <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "1.4rem", fontWeight: 800, color: k.color, lineHeight: 1, marginBottom: 4 }}>{k.value}</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.68rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Top subscribers list */}
        <div>
          <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "0.95rem", fontWeight: 700, color: "#374151", margin: "0 0 12px" }}>
            🏅 Longest-Tenured Subscribers
          </h3>
          {topSubscribers.length === 0 ? (
            <div style={{
              padding: "1.2rem", background: "#fafafa", borderRadius: 12,
              border: "1px dashed #e5e7eb", textAlign: "center",
              color: "#9ca3af", fontSize: "0.88rem",
            }}>
              No active subscribers yet — share your profile to get your first fan! 🚀
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {topSubscribers.map((s) => (
                <div key={s.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "0.75rem 1rem", background: "#fafafa", borderRadius: 12,
                  border: "1px solid #f3f4f6",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.88rem", fontWeight: 600, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</div>
                    <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.75rem", color: "#9ca3af", marginTop: 2 }}>
                      Subscribed {s.days === 0 ? "today" : `${s.days} day${s.days === 1 ? "" : "s"} ago`} · {formatMoney(s.pricePerMonth, creatorCurrency)}/mo
                    </div>
                  </div>
                  <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "1rem", fontWeight: 800, color: "#7c3aed", marginLeft: 12, whiteSpace: "nowrap" }}>
                    ~{formatMoney(s.approxSpent, creatorCurrency)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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
                  {formatMoney(a.totalSpent, creatorCurrency)}
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
            {formatMoney(lifetimeTotalNet, creatorCurrency)}
          </div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.88rem", opacity: 0.75, marginTop: 6 }}>
            {formatMoney(lifetimeOneTimeNet, creatorCurrency)} from questions · {formatMoney(lifetimeSubscriptionNet, creatorCurrency)} from subscriptions
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
