"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, query, where, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { COLLECTIONS, FirestoreUser } from "@/lib/types";
import Swal from "sweetalert2";

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
  // Used by the admin "Cancel Subscription" action so we can show the
  // button only for creators on a paid plan AND know which gateway to hit.
  // The API auto-detects too, but the UI hides the button if both are null.
  stripeSubId?:    string | null;
  razorpaySubId?:  string | null;
}

interface BugReport {
  id: string;
  type:            string;   // "bug" | "feedback" — drives the row badge below
  message:         string;   // user's free-text note
  email:           string;
  name:            string;
  userUid:         string | null;
  url:             string;
  context:         string | null;
  userAgent:       string;
  errorName:       string;
  errorMessage:    string;
  errorStack:      string;
  clientTimestamp: string | null;
  createdAt:       Date | null;
  status:          string;
}

export default function AdminPage() {
  const { user, userProfile, loading } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<FirestoreUser[]>([]);
  const [subs,  setSubs]  = useState<SubscriptionRow[]>([]);
  const [bugs,  setBugs]  = useState<BugReport[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [expandedBug, setExpandedBug] = useState<string | null>(null);

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
        // Bug reports query is wrapped separately because it may fail with
        // a permission error if the firestore.rules update hasn't been
        // deployed yet — we don't want that to break the whole admin page.
        // Include both "bug" and "feedback" types — earlier this filtered
        // to bugs only, which silently hid all 💡 Feedback submissions
        // from the admin panel. Dropping the type filter keeps the same
        // single-field index (createdAt DESC) and shows everything; the
        // row renderer below already handles missing error fields.
        const bugQuery = query(
          collection(db, "feedback"),
          orderBy("createdAt", "desc"),
          limit(50),
        );
        const [usersSnap, subsSnap, bugsSnap] = await Promise.all([
          getDocs(collection(db, COLLECTIONS.USERS)),
          getDocs(collection(db, COLLECTIONS.SUBSCRIPTIONS)),
          getDocs(bugQuery).catch((e) => { console.warn("feedback read failed:", e?.code || e?.message); return null; }),
        ]);
        if (cancelled) return;
        setUsers(usersSnap.docs.map(d => d.data() as FirestoreUser));
        setSubs(subsSnap.docs.map(d => {
          const data = d.data();
          return { creatorId: data.creatorId, status: data.status ?? "active" } as SubscriptionRow;
        }));
        if (bugsSnap) {
          setBugs(bugsSnap.docs.map(d => {
            const x = d.data();
            return {
              id: d.id,
              type:            x.type            || "bug",
              message:         x.message         || "",
              email:           x.email           || "",
              name:            x.name            || "",
              userUid:         x.userUid         || null,
              url:             x.url             || "",
              context:         x.context         || null,
              userAgent:       x.userAgent       || "",
              errorName:       x.errorName       || "",
              errorMessage:    x.errorMessage    || "",
              errorStack:      x.errorStack      || "",
              clientTimestamp: x.clientTimestamp || null,
              createdAt:       x.createdAt?.toDate?.() ?? null,
              status:          x.status          || "pending",
            } as BugReport;
          }));
        }
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

  // Admin "Cancel Subscription" — works for both Stripe and Razorpay subs;
  // the API auto-detects which gateway holds the active sub. We pass the
  // entire creator row in so we can show their name / current plan in the
  // confirm dialog and reload the list optimistically on success.
  const [cancellingUid, setCancellingUid] = useState<string | null>(null);
  const handleCancelUserSub = async (c: CreatorSummary) => {
    if (!user) return;
    const choice = await Swal.fire({
      icon: "warning",
      title: `Cancel ${c.displayName}'s plan?`,
      html: `
        <div style="text-align:left; font-size:0.92rem; line-height:1.55;">
          They're currently on <strong>${planLabel(c.plan)}</strong>.<br/><br/>
          <strong>Cancel at cycle end</strong> — keep features until their current period ends.<br/>
          <strong>Cancel now</strong> — immediate downgrade to Free, no refund handled here.
        </div>
      `,
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: "Cancel at cycle end",
      denyButtonText:    "Cancel now",
      cancelButtonText:  "Keep their plan",
      confirmButtonColor: "#7c3aed",
      denyButtonColor:    "#ef4444",
      cancelButtonColor:  "#6b7280",
      reverseButtons: true,
    });
    if (choice.isDismissed) return;
    const cancelAtCycleEnd = !choice.isDenied;

    setCancellingUid(c.uid);
    try {
      const { getIdToken } = await import("firebase/auth");
      const token = await getIdToken(user as any);
      const res = await fetch("/api/admin/cancel-user-subscription", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ uid: c.uid, cancelAtCycleEnd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cancel failed");

      await Swal.fire({
        icon: "success",
        title: cancelAtCycleEnd ? "Cancellation scheduled" : "Subscription cancelled",
        text:  cancelAtCycleEnd
          ? `${c.displayName}'s plan will end at the cycle close. Their access stays active until then.`
          : `${c.displayName} has been moved to Free. Cancel was processed via ${data.gateway}.`,
        confirmButtonColor: "#7c3aed",
      });
      // Optimistic: drop the user's subId locally so the button hides
      // immediately. The next data fetch will reconcile if anything drifts.
      setUsers(prev => prev.map(u => u.uid === c.uid ? ({
        ...u,
        platformPlan: cancelAtCycleEnd ? u.platformPlan : "free",
        platformPlanCancelAtPeriodEnd: cancelAtCycleEnd ? true : undefined,
        platformPlanStripeSubId:   cancelAtCycleEnd ? (u as any).platformPlanStripeSubId   : null,
        platformPlanRazorpaySubId: cancelAtCycleEnd ? (u as any).platformPlanRazorpaySubId : null,
      } as any) : u));
    } catch (err: any) {
      await Swal.fire({
        icon: "error",
        title: "Cancel failed",
        text:  err.message || "Unknown error",
        confirmButtonColor: "#7c3aed",
      });
    } finally {
      setCancellingUid(null);
    }
  };

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
        stripeSubId:   (c as any).platformPlanStripeSubId   ?? null,
        razorpaySubId: (c as any).platformPlanRazorpaySubId ?? null,
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
                    <th style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {creatorSummaries.map(c => {
                    const hasActiveSub = !!(c.stripeSubId || c.razorpaySubId);
                    const subGateway = c.razorpaySubId ? "razorpay" : c.stripeSubId ? "stripe" : null;
                    return (
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
                        {subGateway && (
                          <div style={{ color: "#9ca3af", fontSize: "0.68rem", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            via {subGateway}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "12px", textAlign: "right", fontWeight: 700 }}>{fmtInt(c.fans)}</td>
                      <td style={{ padding: "12px", textAlign: "right" }}>{fmt$(c.totalEarnings)}</td>
                      <td style={{ padding: "12px", textAlign: "right", fontWeight: 700, color: "#10b981" }}>{fmt$(c.creatorNet)}</td>
                      <td style={{ padding: "12px", textAlign: "right" }}>
                        {hasActiveSub ? (
                          <button
                            onClick={() => handleCancelUserSub(c)}
                            disabled={cancellingUid === c.uid}
                            style={{
                              padding: "5px 12px", borderRadius: 8,
                              border: "1px solid #fca5a5",
                              background: cancellingUid === c.uid ? "#fef2f2" : "#fff",
                              color: "#b91c1c",
                              fontSize: "0.78rem", fontWeight: 700,
                              cursor: cancellingUid === c.uid ? "wait" : "pointer",
                              whiteSpace: "nowrap",
                            }}
                            title={`Cancel this creator's ${subGateway} subscription`}
                          >
                            {cancellingUid === c.uid ? "Cancelling…" : "Cancel Sub"}
                          </button>
                        ) : (
                          <span style={{ color: "#d1d5db", fontSize: "0.78rem" }}>—</span>
                        )}
                      </td>
                    </tr>
                    );
                  })}
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

        {/* REPORTS & FEEDBACK */}
        <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: "1.5rem", marginTop: 28, boxShadow: "0 4px 12px rgba(0,0,0,0.04)" }}>
          <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "1.15rem", fontWeight: 800, margin: "0 0 4px" }}>
            Reports &amp; Feedback · {fmtInt(bugs.length)}
          </h2>
          <p style={{ color: "#6b7280", fontSize: "0.85rem", margin: "0 0 16px" }}>
            Latest 50 entries from the in-app feedback widget — both 🐞 Bug Reports and 💡 Feedback.
            Each row shows who submitted it, the underlying error (if a bug), and what the user typed.
            Click a row to expand the full stack trace + user-agent.
          </p>

          {bugs.length === 0 ? (
            <div style={{ padding: "1.5rem", color: "#9ca3af", textAlign: "center", border: "1px dashed #e5e7eb", borderRadius: 12 }}>
              No bug reports yet — or this admin doesn&apos;t have read access to the
              <code style={{ background: "#f3f4f6", padding: "1px 6px", borderRadius: 4, margin: "0 4px" }}>feedback</code>
              collection (deploy <code style={{ background: "#f3f4f6", padding: "1px 6px", borderRadius: 4 }}>firestore.rules</code> if so).
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {bugs.map(b => {
                const expanded = expandedBug === b.id;
                const when = b.createdAt
                  ? b.createdAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
                  : "(no timestamp)";
                const whoLabel = b.name && b.name !== "Anonymous"
                  ? `${b.name} · ${b.email || "no email"}`
                  : (b.email && b.email !== "anonymous") ? b.email : "Anonymous";
                return (
                  <div
                    key={b.id}
                    style={{
                      border: "1px solid #f3f4f6", borderRadius: 12,
                      padding: "12px 14px", background: "#fafafa",
                      cursor: "pointer",
                    }}
                    onClick={() => setExpandedBug(expanded ? null : b.id)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: "#1f2937", fontSize: "0.92rem", marginBottom: 2 }}>
                          {whoLabel}
                        </div>
                        <div style={{ color: "#6b7280", fontSize: "0.78rem" }}>
                          {when}
                          {b.context && <> · <span style={{ color: "#7c3aed", fontWeight: 600 }}>{b.context}</span></>}
                          {b.url && <> · <span style={{ color: "#9ca3af" }}>{b.url.replace(/^https?:\/\/[^/]+/, "")}</span></>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                        {/* Type badge — distinguishes 💡 feedback from 🐞 bug */}
                        <span style={{
                          padding: "2px 8px", borderRadius: 99,
                          background: b.type === "feedback" ? "#dbeafe" : "#fee2e2",
                          color:      b.type === "feedback" ? "#1e40af" : "#991b1b",
                          fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
                        }}>{b.type === "feedback" ? "💡 Feedback" : "🐞 Bug"}</span>
                        <span style={{
                          padding: "2px 8px", borderRadius: 99,
                          background: b.status === "pending" ? "#fef3c7" : "#dcfce7",
                          color:      b.status === "pending" ? "#92400e" : "#166534",
                          fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
                        }}>{b.status}</span>
                      </div>
                    </div>

                    {/* Error one-liner — only relevant for bug reports. Feedback
                        entries have no stack/error fields, so suppress the red
                        box entirely instead of showing "(no error message)". */}
                    {b.type !== "feedback" && (
                      <div style={{
                        marginTop: 8, padding: "6px 10px",
                        background: "#fff", border: "1px solid #fecaca",
                        borderRadius: 8, fontFamily: "monospace", fontSize: "0.78rem",
                        color: "#b91c1c", overflow: "hidden", textOverflow: "ellipsis",
                        whiteSpace: expanded ? "pre-wrap" : "nowrap",
                      }}>
                        {b.errorName ? `${b.errorName}: ` : ""}{b.errorMessage || "(no error message)"}
                      </div>
                    )}

                    {/* User note */}
                    {b.message && b.message !== "(no user note provided)" && (
                      <div style={{
                        marginTop: 8, padding: "8px 12px",
                        background: "#f5f3ff", borderLeft: "3px solid #7c3aed",
                        borderRadius: "0 8px 8px 0", color: "#374151", fontSize: "0.85rem",
                        lineHeight: 1.5,
                      }}>
                        <span style={{ fontWeight: 700, color: "#7c3aed", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>User said:</span>{" "}
                        {b.message}
                      </div>
                    )}

                    {expanded && (
                      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                        {b.errorStack && (
                          <details open style={{ background: "#1f2937", color: "#e5e7eb", borderRadius: 8, padding: "10px 12px" }}>
                            <summary style={{ cursor: "pointer", fontSize: "0.78rem", fontWeight: 700, color: "#fca5a5" }}>
                              Stack trace
                            </summary>
                            <pre style={{ marginTop: 8, fontFamily: "monospace", fontSize: "0.72rem", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>
                              {b.errorStack}
                            </pre>
                          </details>
                        )}
                        <div style={{ fontSize: "0.75rem", color: "#6b7280", display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 10px" }}>
                          {b.userUid && (<><strong>UID</strong><code style={{ fontFamily: "monospace" }}>{b.userUid}</code></>)}
                          {b.userAgent && (<><strong>UA</strong><code style={{ fontFamily: "monospace", wordBreak: "break-word" }}>{b.userAgent}</code></>)}
                          {b.clientTimestamp && (<><strong>Client time</strong><code style={{ fontFamily: "monospace" }}>{b.clientTimestamp}</code></>)}
                        </div>
                      </div>
                    )}
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
