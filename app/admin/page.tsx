"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { COLLECTIONS, FirestoreUser } from "@/lib/types";

// ── Tiny formatting helpers (kept local — the admin page is the only consumer) ──
const fmt$ = (cents: number) =>
  "$" + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n: number) => n.toLocaleString();
const planLabel = (p?: string) => p === "pro" ? "Pro" : p === "creator" ? "Creator" : "Free";
const planColor = (p?: string) => p === "pro" ? "#7c3aed" : p === "creator" ? "#0ea5e9" : "#6b7280";

interface SubscriptionRow {
  creatorId: string;
  status: string;
}

interface TrafficRow {
  source: string;
  count: number;
}

interface CreatorSummary {
  uid: string;
  displayName: string;
  username: string;
  email: string;
  plan: string;
  fans: number;             // active subscribers
  totalEarnings: number;    // cents, gross
  creatorNet: number;       // cents, what they actually receive
}

export default function AdminPage() {
  const { user, userProfile, loading } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<FirestoreUser[]>([]);
  const [subs,  setSubs]  = useState<SubscriptionRow[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Gate: only admins past this point.
  useEffect(() => {
    if (!loading && (!user || !userProfile?.isAdmin)) router.replace("/dashboard");
  }, [loading, user, userProfile, router]);

  // Load once on mount (per admin visit). We don't need realtime here —
  // these numbers shift slowly enough that a hard refresh is fine. We also
  // skip questions entirely: revenue + earnings are cached on the user doc
  // (`totalEarnings`, `totalPlatformFee`, `totalCreatorNet`) which is far
  // cheaper than scanning the whole questions collection.
  useEffect(() => {
    if (!userProfile?.isAdmin) return;
    let cancelled = false;
    (async () => {
      setDataLoading(true);
      try {
        const [usersSnap, subsSnap] = await Promise.all([
          getDocs(collection(db, COLLECTIONS.USERS)),
          getDocs(collection(db, COLLECTIONS.SUBSCRIPTIONS)),
        ]);
        if (cancelled) return;
        setUsers(usersSnap.docs.map(d => d.data() as FirestoreUser));
        setSubs(subsSnap.docs.map(d => {
          const data = d.data();
          return { creatorId: data.creatorId, status: data.status ?? "active" } as SubscriptionRow;
        }));
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userProfile]);

  // ── Derived stats ──────────────────────────────────────────────────────
  const creators = useMemo(() => users.filter(u => u.isCreator), [users]);
  const fans     = useMemo(() => users.filter(u => !u.isCreator), [users]);

  // Active-subscriber count per creator uid → used as "fans" in the per-
  // creator table. Free fans (non-subscribers who only ever sent one-off
  // questions) are intentionally not counted here; the user docs that lack
  // `isCreator: true` already give us the global fan count above.
  const subsPerCreator = useMemo(() => {
    const m: Record<string, number> = {};
    subs.forEach(s => {
      if (s.status === "active") m[s.creatorId] = (m[s.creatorId] || 0) + 1;
    });
    return m;
  }, [subs]);

  const creatorSummaries: CreatorSummary[] = useMemo(() => {
    return creators
      .map(c => ({
        uid:           c.uid,
        displayName:   c.displayName || c.username || "(unnamed)",
        username:      c.username || "",
        email:         (c as any).email || "",
        plan:          (c as any).platformPlan || "free",
        fans:          subsPerCreator[c.uid] || 0,
        totalEarnings: (c as any).totalEarnings   || 0,
        creatorNet:    (c as any).totalCreatorNet || 0,
      }))
      .sort((a, b) => b.totalEarnings - a.totalEarnings);
  }, [creators, subsPerCreator]);

  // Platform revenue = sum of platform-fee buckets across all creators.
  // This is the cumulative split written by the webhook on every payment,
  // accurate across plan-tier changes (each payment was bucketed at the fee
  // active right then).
  const platformRevenue = useMemo(
    () => creators.reduce((s, c) => s + ((c as any).totalPlatformFee || 0), 0),
    [creators],
  );
  const grossProcessed = useMemo(
    () => creators.reduce((s, c) => s + ((c as any).totalEarnings || 0), 0),
    [creators],
  );

  // Traffic / attribution breakdown — counts users by `attribution.source`.
  // Users predating attribution capture roll up into "Unknown / pre-tracking".
  const traffic: TrafficRow[] = useMemo(() => {
    const counts: Record<string, number> = {};
    users.forEach(u => {
      const src = (u as any).attribution?.source as string | undefined;
      const key = src && src.trim() ? src : "unknown";
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);
  }, [users]);
  const trafficTotal = traffic.reduce((s, r) => s + r.count, 0);

  if (loading || !userProfile) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 48, height: 48, border: "4px solid #e5e7eb", borderTop: "4px solid #7c3aed", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }
  if (!userProfile.isAdmin) return null;

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "'Inter', sans-serif", color: "#111827" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* HEADER */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "clamp(1.8rem, 3vw, 2.4rem)", fontWeight: 900, margin: 0 }}>
              Admin
            </h1>
            <p style={{ color: "#6b7280", margin: "6px 0 0", fontSize: "0.95rem" }}>
              Overview of creators, earnings and where users come from.
            </p>
          </div>
          {dataLoading && (
            <span style={{ color: "#6b7280", fontSize: "0.85rem" }}>Loading…</span>
          )}
        </div>

        {/* TOP STATS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 28 }}>
          {[
            { label: "Creators",         value: fmtInt(creators.length),        color: "#7c3aed", icon: "🎓" },
            { label: "Fans",             value: fmtInt(fans.length),            color: "#0ea5e9", icon: "👥" },
            { label: "Platform Revenue", value: fmt$(platformRevenue),          color: "#10b981", icon: "💰" },
            { label: "Gross Processed",  value: fmt$(grossProcessed),           color: "#f59e0b", icon: "📈" },
          ].map(k => (
            <div key={k.label} style={{
              background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16,
              padding: "1.2rem 1rem", textAlign: "center",
              boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
            }}>
              <div style={{ fontSize: "1.3rem", marginBottom: 6 }}>{k.icon}</div>
              <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 900, fontSize: "1.6rem", color: k.color, lineHeight: 1, marginBottom: 4 }}>{k.value}</div>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* CREATORS TABLE */}
        <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: "1.5rem", marginBottom: 28, boxShadow: "0 4px 12px rgba(0,0,0,0.04)" }}>
          <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "1.15rem", fontWeight: 800, margin: "0 0 4px" }}>
            Creators · {creators.length}
          </h2>
          <p style={{ color: "#6b7280", fontSize: "0.85rem", margin: "0 0 16px" }}>
            Per-creator plan, active fans (subscribers), and lifetime earnings.
          </p>

          {creatorSummaries.length === 0 ? (
            <div style={{ padding: "1.5rem", color: "#9ca3af", textAlign: "center", border: "1px dashed #e5e7eb", borderRadius: 12 }}>
              No creators yet.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#6b7280", fontWeight: 700, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    <th style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>Creator</th>
                    <th style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>Plan</th>
                    <th style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", textAlign: "right" }}>Fans</th>
                    <th style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", textAlign: "right" }}>Gross</th>
                    <th style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", textAlign: "right" }}>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {creatorSummaries.map(c => (
                    <tr key={c.uid} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "12px" }}>
                        <div style={{ fontWeight: 700, color: "#111827" }}>{c.displayName}</div>
                        <div style={{ color: "#9ca3af", fontSize: "0.78rem" }}>@{c.username || "—"} · {c.email}</div>
                      </td>
                      <td style={{ padding: "12px" }}>
                        <span style={{
                          padding: "3px 9px", borderRadius: 99,
                          background: planColor(c.plan) + "1A",
                          color: planColor(c.plan),
                          fontWeight: 700, fontSize: "0.72rem",
                          textTransform: "uppercase", letterSpacing: "0.04em",
                        }}>{planLabel(c.plan)}</span>
                      </td>
                      <td style={{ padding: "12px", textAlign: "right", fontWeight: 700 }}>{fmtInt(c.fans)}</td>
                      <td style={{ padding: "12px", textAlign: "right" }}>{fmt$(c.totalEarnings)}</td>
                      <td style={{ padding: "12px", textAlign: "right", fontWeight: 700, color: "#10b981" }}>{fmt$(c.creatorNet)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* TRAFFIC / ACQUISITION */}
        <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: "1.5rem", boxShadow: "0 4px 12px rgba(0,0,0,0.04)" }}>
          <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "1.15rem", fontWeight: 800, margin: "0 0 4px" }}>
            Traffic Sources · {fmtInt(trafficTotal)} users
          </h2>
          <p style={{ color: "#6b7280", fontSize: "0.85rem", margin: "0 0 16px" }}>
            Where each user came from when they first signed up. Captured from
            <code style={{ background: "#f3f4f6", padding: "1px 6px", borderRadius: 4, margin: "0 4px" }}>document.referrer</code>
            and <code style={{ background: "#f3f4f6", padding: "1px 6px", borderRadius: 4 }}>utm_*</code> params.
            Users who signed up before tracking was enabled show up as <em>unknown</em>.
          </p>

          {traffic.length === 0 ? (
            <div style={{ padding: "1.5rem", color: "#9ca3af", textAlign: "center", border: "1px dashed #e5e7eb", borderRadius: 12 }}>
              No users yet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {traffic.map(row => {
                const pct = trafficTotal > 0 ? Math.round((row.count / trafficTotal) * 100) : 0;
                return (
                  <div key={row.source}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: "#374151", fontSize: "0.88rem", textTransform: "capitalize" }}>
                        {row.source === "direct" ? "Direct (typed / bookmarked)" : row.source}
                      </span>
                      <span style={{ fontWeight: 700, color: "#7c3aed", fontSize: "0.85rem" }}>
                        {fmtInt(row.count)} · {pct}%
                      </span>
                    </div>
                    <div style={{ height: 8, background: "#f3f4f6", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{
                        width: `${pct}%`, height: "100%",
                        background: "linear-gradient(90deg, #7c3aed, #a855f7)",
                        borderRadius: 99, transition: "width 0.6s ease",
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
