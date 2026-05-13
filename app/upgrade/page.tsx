"use client";

import { useAuth } from "@/context/AuthContext";
import { useProfileSettings } from "@/app/profile/useProfileSettings";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  creator: "Creator",
  pro: "Pro",
};

export default function UpgradePage() {
  const { user, userProfile, loading, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [portalLoading, setPortalLoading] = useState(false);
  // Per-plan loading state so only the clicked card's button shows
  // "Processing…" — the previous shared boolean was lighting up every
  // plan card whenever any one was clicked.
  const [busyPlan, setBusyPlan] = useState<"free" | "creator" | "pro" | null>(null);
  // True while we're hitting /api/stripe/sync-plan after a Checkout redirect so
  // the page can show a "Verifying your plan…" affordance.
  const [verifying, setVerifying] = useState(false);
  // Avoid running the post-checkout sync twice (React Strict Mode double-mount,
  // or if the URL is shared / refreshed).
  const handledRedirectRef = useRef(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  // After a Stripe Checkout return we end up at /upgrade?plan_activated=<plan>
  // (success) or /upgrade?plan_cancelled=true (user backed out of Checkout, or
  // a subscription was cancelled via the Billing Portal). In both cases we
  // proactively hit /api/stripe/sync-plan so the local Firestore platformPlan
  // matches Stripe even when the webhook isn't reachable (e.g. local dev).
  useEffect(() => {
    if (!user || handledRedirectRef.current) return;
    const activated = searchParams?.get("plan_activated");
    const cancelled = searchParams?.get("plan_cancelled");
    if (!activated && !cancelled) return;
    handledRedirectRef.current = true;

    let stale = false;
    (async () => {
      setVerifying(true);
      try {
        const { getIdToken } = await import("firebase/auth");
        const token = await getIdToken(user as any);
        await fetch("/api/stripe/sync-plan", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});

        if (stale) return;

        if (activated) {
          await Swal.fire({
            icon: "success",
            title: `You're on ${PLAN_LABEL[activated] ?? "your new plan"}! 🎉`,
            text: "Your platform fee is updated. Welcome to the new tier.",
            confirmButtonColor: "#7c3aed",
            timer: 4000,
            timerProgressBar: true,
          });
        } else if (cancelled === "true") {
          await Swal.fire({
            icon: "info",
            title: "Checkout cancelled",
            text: "No changes were made to your plan.",
            confirmButtonColor: "#7c3aed",
          });
        }
      } finally {
        if (!stale) {
          setVerifying(false);
          // Strip the URL params so a refresh doesn't re-toast.
          router.replace("/upgrade");
        }
      }
    })();
    return () => { stale = true; };
  }, [user, searchParams, router]);

  if (loading || !user) return <div style={{ padding: 40, color: "white" }}>Loading...</div>;

  const platformPlan = (userProfile as any)?.platformPlan ?? "free";
  // Mirror the "scheduled cancellation" state from Stripe so the
  // current-plan card can say "Cancels on <date>" instead of just
  // "Manage Billing →". The fields are populated by both /api/stripe/
  // sync-plan and the customer.subscription.{updated,deleted} webhook.
  const planCancelAtPeriodEnd = !!(userProfile as any)?.planCancelAtPeriodEnd;
  const planCurrentPeriodEndRaw = (userProfile as any)?.planCurrentPeriodEnd;
  const planCurrentPeriodEnd: Date | null =
    planCurrentPeriodEndRaw && typeof planCurrentPeriodEndRaw.toDate === "function"
      ? planCurrentPeriodEndRaw.toDate()
      : planCurrentPeriodEndRaw instanceof Date
        ? planCurrentPeriodEndRaw
        : (typeof planCurrentPeriodEndRaw === "string" || typeof planCurrentPeriodEndRaw === "number")
          ? new Date(planCurrentPeriodEndRaw)
          : null;
  const cancelDateLabel = planCurrentPeriodEnd
    ? planCurrentPeriodEnd.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : "";

  const handleManagePlan = async () => {
    if (!user) return;
    setPortalLoading(true);
    try {
      const { getIdToken } = await import("firebase/auth");
      const token = await getIdToken(user as any);
      const res   = await fetch("/api/stripe/billing-portal", {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ returnUrl: "/upgrade" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Billing portal failed");
      if (data.url) {
        window.open(data.url, "_blank");
      }
    } catch (err: any) {
      alert(err.message || "Could not open billing portal. Try again.");
    } finally {
      setPortalLoading(false);
    }
  };

  // Start a fresh Stripe Checkout session for users moving off the free plan.
  // The billing portal can't create a brand-new subscription — it only manages
  // an existing one — so a free → paid jump must go through Checkout first.
  const handleStartCheckout = async (plan: "creator" | "pro") => {
    if (!user) return;
    setBusyPlan(plan);
    try {
      const res = await fetch("/api/stripe/create-subscription-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          email: user.email ?? "",
          plan,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start checkout");
      if (data.url) {
        // Full-page redirect — Stripe Checkout owns the next screen.
        window.location.href = data.url;
        return;
      }
      throw new Error("Checkout session missing URL");
    } catch (err: any) {
      alert(err.message || "Could not start checkout. Try again.");
      setBusyPlan(null);
    }
  };

  // Plan change for paying users. Two explicit payment paths so the price
  // is never $0 (no Stripe proration trickery):
  //   - "card":     cancel the current sub (no proration), launch a fresh
  //                 Stripe Checkout for the new plan at its full price.
  //   - "earnings": deduct the new plan's monthly fee from the creator's
  //                 accrued totalEarnings. Falls back to "card" if the
  //                 server reports INSUFFICIENT_EARNINGS.
  const handleChangePlan = async (plan: "creator" | "pro") => {
    if (!user) return;

    const target = plan === "pro"
      ? { name: "Pro",     price: "$9.99", fee: "0%" }
      : { name: "Creator", price: "$4.99", fee: "5%" };
    const currentLabel = PLAN_LABEL[platformPlan] ?? "your current plan";
    const isUp = (platformPlan === "free")
      || (platformPlan === "creator" && plan === "pro");

    const earningsCents = ((userProfile as any)?.totalEarnings ?? 0) as number;
    const feeCents = plan === "pro" ? 999 : 499;
    const canUseEarnings = earningsCents >= feeCents;
    const earningsLabel = `$${(earningsCents / 100).toFixed(2)}`;

    // SweetAlert2 returns "isConfirmed" for the primary action and
    // "isDenied" for the secondary action (which we use as
    // "pay from earnings"). isDismissed = user cancelled.
    const choice = await Swal.fire({
      icon: "question",
      title: `${isUp ? "Upgrade" : "Switch"} to ${target.name}?`,
      html: `
        <div style="text-align:left; font-size:0.92rem; line-height:1.55;">
          Switching from <strong>${currentLabel}</strong> to <strong>${target.name}</strong> — ${target.price}/month, ${target.fee} platform fee.<br/><br/>
          <strong>How would you like to pay?</strong><br/>
          <span style="color:#6b7280; font-size:0.85rem;">
            Card opens Stripe Checkout for ${target.price} today.<br/>
            Earnings deducts ${target.price} from your accrued balance (currently <strong>${earningsLabel}</strong>)
            ${canUseEarnings ? "" : " — not enough to cover this plan."}.
          </span>
        </div>
      `,
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: `Pay with card (${target.price})`,
      denyButtonText: canUseEarnings ? `Use earnings (${target.price})` : `Earnings (${earningsLabel} — short)`,
      cancelButtonText: "Not now",
      confirmButtonColor: "#7c3aed",
      denyButtonColor: canUseEarnings ? "#10b981" : "#9ca3af",
      cancelButtonColor: "#6b7280",
      reverseButtons: true,
    });
    if (choice.isDismissed) return;

    const method: "card" | "earnings" = choice.isDenied ? "earnings" : "card";
    if (method === "earnings" && !canUseEarnings) {
      await Swal.fire({
        icon: "warning",
        title: "Not enough earnings",
        html: `Your accrued earnings (${earningsLabel}) can't cover ${target.price}.<br/>Pay with card instead or earn more first.`,
        confirmButtonColor: "#7c3aed",
      });
      return;
    }

    setBusyPlan(plan);
    try {
      const { getIdToken } = await import("firebase/auth");
      const token = await getIdToken(user as any);
      const res = await fetch("/api/stripe/change-plan", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ plan, method }),
      });
      const data = await res.json();

      if (res.status === 402 && data?.error === "INSUFFICIENT_EARNINGS") {
        await Swal.fire({
          icon: "warning",
          title: "Not enough earnings",
          html: `You need ${target.price} but only have $${((data.availableCents ?? 0) / 100).toFixed(2)} in accrued earnings. Try paying with card.`,
          confirmButtonColor: "#7c3aed",
        });
        return;
      }
      if (!res.ok) throw new Error(data.error || "Could not change plan");

      if (data.method === "card" && data.checkoutUrl) {
        // Full-page redirect to Stripe Checkout — Stripe will charge the
        // full plan price and our webhook will flip platformPlan on success.
        window.location.href = data.checkoutUrl;
        return;
      }

      // Earnings path succeeded server-side. Confirm with a toast + refresh.
      await Swal.fire({
        icon: "success",
        title: `You're on ${target.name}! 🎉`,
        html: `
          <div style="font-size:0.92rem; line-height:1.5;">
            <strong>${target.price}</strong> was deducted from your earnings.
            Remaining balance: <strong>$${((data.remainingEarningsCents ?? 0) / 100).toFixed(2)}</strong>.
          </div>
        `,
        confirmButtonColor: "#7c3aed",
        timer: 4500,
        timerProgressBar: true,
      });
      try {
        await fetch("/api/stripe/sync-plan", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch { /* webhook will reconcile */ }
    } catch (err: any) {
      alert(err.message || "Could not change plan. Try again.");
    } finally {
      setBusyPlan(null);
    }
  };

  const handleDeleteAccount = async () => {
    const result = await Swal.fire({
      title: "Delete Account?",
      html: "This will <strong>permanently delete</strong> your account, profile, and all data.<br/><br/>This <u>cannot be undone</u>.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Yes, delete my account",
      cancelButtonText: "Cancel",
      reverseButtons: true,
    });
    if (result.isConfirmed) {
      await Swal.fire({
        title: "Request Submitted",
        html: "Please email <strong>support@askexpert.live</strong> to complete your account deletion. We'll process it within 24 hours.",
        icon: "info",
        confirmButtonColor: "var(--purple)",
        confirmButtonText: "Got it",
      });
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 24px" }}>
      <div className="card-brutal">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{ background: "var(--purple-light)", color: "var(--purple)", width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", border: "2px solid rgba(124,58,237,0.2)" }}>🚀</div>
          <h2 className="font-display" style={{ fontSize: "1.8rem", color: "var(--text-dark)", margin: 0 }}>Your Plan</h2>
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", marginBottom: 18, maxWidth: 500 }}>Your plan determines your platform fee. Upgrade to keep more of what you earn and unlock premium features.</p>

        {verifying && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.25)",
            color: "#7c3aed", padding: "10px 14px", borderRadius: 12,
            marginBottom: 18, fontSize: "0.85rem", fontWeight: 600,
          }}>
            <span>⏳</span>
            <span>Verifying your plan with Stripe…</span>
          </div>
        )}

        {/* 3-column grid on desktop, collapses to a single column below 720px.
            `minmax(0, 1fr)` lets each card shrink to fit instead of insisting
            on its content's intrinsic width, so all three sit on one line. */}
        <div className="upgrade-plans-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16, alignItems: "stretch" }}>
          {([
            {
              plan: "free" as const, label: "Free", price: "$0", period: "forever",
              fee: "15%", feeLabel: "per transaction", accent: "var(--text-muted)", accentBg: "#f3f4f6",
              perks: ["Public creator profile", "Unlimited questions", "Pay-per-question & monthly sub", "Up to $1,000 lifetime earnings"],
            },
            {
              // Explicit rgba on the badge background so it's reliably light
              // violet (the `--purple-light` token was rendering nearly solid
              // and swallowing the purple text on top of it).
              plan: "creator" as const, label: "Creator", price: "$4.99", period: "per month",
              fee: "5%", feeLabel: "per transaction", accent: "#7c3aed", accentBg: "rgba(124,58,237,0.12)",
              perks: ["Everything in Free", "Custom profile branding", "Priority support", "Up to $10,000 lifetime earnings"],
            },
            {
              plan: "pro" as const, label: "Pro", price: "$9.99", period: "per month",
              fee: "0%", feeLabel: "platform fee", accent: "var(--green)", accentBg: "rgba(16,185,129,0.1)",
              perks: ["Everything in Creator", "Zero platform fee", "Unlimited earnings", "Dedicated account manager"],
            },
          ] as const).map(({ plan, label, price, period, fee, feeLabel, accent, accentBg, perks }) => {
            const isCurrent = platformPlan === plan;
            const planOrder = { free: 0, creator: 1, pro: 2 };
            const isUpgrade = planOrder[plan] > planOrder[platformPlan as "free" | "creator" | "pro"];
            const isDowngrade = planOrder[plan] < planOrder[platformPlan as "free" | "creator" | "pro"];
            return (
              <div key={plan} style={{
                border: `2px solid ${isCurrent ? accent : "var(--border)"}`,
                borderRadius: 20, padding: "24px",
                background: isCurrent ? "#fff" : "#fafafa",
                position: "relative",
                boxShadow: isCurrent ? `4px 4px 0px ${accent}` : "none",
                transition: "all 0.2s",
                transform: isCurrent ? "translateY(-4px)" : "none",
              }}>
                {isCurrent && (
                  <span style={{
                    position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)",
                    background: accent, color: "#fff", fontSize: "0.75rem", fontWeight: 800,
                    padding: "4px 14px", borderRadius: 99, whiteSpace: "nowrap", border: "2px solid #fff",
                    letterSpacing: "0.05em"
                  }}>★ CURRENT PLAN</span>
                )}
                {isCurrent && planCancelAtPeriodEnd && cancelDateLabel && (
                  <span style={{
                    position: "absolute", top: 14, right: 14,
                    background: "#fef2f2", color: "#b91c1c", fontSize: "0.7rem", fontWeight: 800,
                    padding: "3px 8px", borderRadius: 6, whiteSpace: "nowrap",
                    border: "1px solid #fca5a5", letterSpacing: "0.04em",
                  }}>⏳ ENDS {cancelDateLabel.toUpperCase()}</span>
                )}
                <div style={{ display: "inline-flex", background: accentBg, color: accent, borderRadius: 8, padding: "4px 12px", fontSize: "0.85rem", fontWeight: 800, marginBottom: 16, textTransform: "uppercase" }}>{label}</div>
                <p style={{ fontFamily: "var(--font-main)", fontSize: "2.5rem", fontWeight: 900, color: "var(--text-dark)", margin: "0 0 4px", lineHeight: 1 }}>{price}</p>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: "0 0 16px", fontWeight: 600 }}>/{period}</p>
                <div style={{ background: accentBg, border: `2px solid ${accent}40`, borderRadius: 12, padding: "8px 12px", marginBottom: 20, display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontFamily: "var(--font-main)", fontSize: "1.4rem", fontWeight: 900, color: accent }}>{fee}</span>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-dark)", fontWeight: 600 }}>{feeLabel}</span>
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {perks.map(p => (
                    <li key={p} style={{ display: "flex", gap: 10, fontSize: "0.9rem", color: "var(--text-dark)", alignItems: "flex-start", fontWeight: 500 }}>
                      <span style={{ color: accent, flexShrink: 0, fontWeight: 800 }}>✓</span>{p}
                    </li>
                  ))}
                </ul>
                {isCurrent ? (
                  // Current-plan card: don't repeat "Upgrade to X". Surface a
                  // Manage Billing affordance only for paid plans (free has no
                  // Stripe subscription to manage). When the subscription is
                  // scheduled to end at the period end, the label switches to
                  // a cancellation-aware string so the creator sees the date.
                  platformPlan === "free" ? (
                    <div style={{
                      width: "100%", padding: "12px 0", fontSize: "0.85rem",
                      textAlign: "center", color: "var(--text-muted)", fontWeight: 700,
                    }}>
                      You're on the free plan.
                    </div>
                  ) : planCancelAtPeriodEnd && cancelDateLabel ? (
                    <button
                      onClick={handleManagePlan}
                      disabled={portalLoading}
                      className="btn-brutal"
                      style={{
                        width: "100%", padding: "12px 0", fontSize: "0.9rem",
                        borderColor: "#fca5a5", background: "#fef2f2", color: "#b91c1c",
                      }}
                      title="Click to keep your subscription or change your card"
                    >
                      {portalLoading ? "Opening…" : `Cancels on ${cancelDateLabel} → Manage`}
                    </button>
                  ) : (
                    <button
                      onClick={handleManagePlan}
                      disabled={portalLoading}
                      className="btn-brutal"
                      style={{
                        width: "100%", padding: "12px 0", fontSize: "0.95rem",
                        borderColor: accent, background: "transparent", color: accent,
                      }}
                    >
                      {portalLoading ? "Opening…" : "Manage Billing →"}
                    </button>
                  )
                ) : (() => {
                  // Routing logic:
                  //   free  -> paid  : fresh Checkout (no existing sub to swap).
                  //   paid  -> paid  : swap price on the existing sub via
                  //                    /api/stripe/change-plan so we don't end
                  //                    up with parallel subscriptions in Stripe.
                  //   paid  -> free  : open the Billing Portal to cancel.
                  const onClick = () => {
                    if (plan === "free") return handleManagePlan();
                    if (platformPlan === "free") return handleStartCheckout(plan);
                    return handleChangePlan(plan);
                  };
                  const isBusy = busyPlan === plan;
                  return (
                    <button
                      onClick={onClick}
                      disabled={isBusy || busyPlan !== null}
                      className="btn-brutal"
                      style={{
                        width: "100%", padding: "12px 0", fontSize: "0.95rem",
                        borderColor: isDowngrade ? "#cbd5e1" : accent,
                        background: isUpgrade ? accent : "transparent",
                        color: isUpgrade ? "#fff" : isDowngrade ? "var(--text-muted)" : accent,
                        opacity: busyPlan !== null && !isBusy ? 0.55 : 1,
                      }}
                    >
                      {isBusy
                        ? "Processing…"
                        : isUpgrade
                          ? `Upgrade to ${label} →`
                          : isDowngrade
                            ? `Downgrade to ${label}`
                            : ""}
                    </button>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>

      {/* Account actions — billing, sign out, danger zone. Moved here so the
          sidebar avatar can navigate directly instead of opening a popover. */}
      <div className="card-brutal" style={{ marginTop: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{ background: "rgba(124,58,237,0.12)", color: "#7c3aed", width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", border: "2px solid rgba(124,58,237,0.2)" }}>⚙️</div>
          <h2 className="font-display" style={{ fontSize: "1.4rem", color: "var(--text-dark)", margin: 0 }}>Account</h2>
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: 24 }}>
          Manage your billing, sign out, or close your account.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Manage Billing & Cancel */}
          <button
            type="button"
            onClick={handleManagePlan}
            disabled={portalLoading}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              width: "100%", padding: "14px 18px", borderRadius: 12,
              border: "1.5px solid var(--border)", background: "#fff",
              cursor: portalLoading ? "wait" : "pointer",
              transition: "all 0.18s",
              fontFamily: "inherit", textAlign: "left",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#c4b5fd"; (e.currentTarget as HTMLButtonElement).style.background = "#faf5ff"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.background = "#fff"; }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: "1.3rem" }}>💳</span>
              <div>
                <div style={{ fontWeight: 800, color: "var(--text-dark)", fontSize: "0.95rem" }}>Manage Billing & Cancel</div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: 2 }}>Update payment method, view invoices, or cancel your plan</div>
              </div>
            </div>
            <span style={{ color: "#7c3aed", fontWeight: 700, fontSize: "0.85rem", whiteSpace: "nowrap" }}>
              {portalLoading ? "Opening…" : "Open Portal →"}
            </span>
          </button>

          {/* Sign Out */}
          <button
            type="button"
            onClick={handleLogout}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              width: "100%", padding: "14px 18px", borderRadius: 12,
              border: "1.5px solid var(--border)", background: "#fff",
              cursor: "pointer", transition: "all 0.18s",
              fontFamily: "inherit", textAlign: "left",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#cbd5e1"; (e.currentTarget as HTMLButtonElement).style.background = "#f9fafb"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.background = "#fff"; }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: "1.3rem" }}>🚪</span>
              <div>
                <div style={{ fontWeight: 800, color: "var(--text-dark)", fontSize: "0.95rem" }}>Sign Out</div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: 2 }}>End your session on this device</div>
              </div>
            </div>
            <span style={{ color: "#6b7280", fontWeight: 700, fontSize: "0.85rem" }}>→</span>
          </button>

          {/* Danger — Delete Account */}
          <button
            type="button"
            onClick={handleDeleteAccount}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              width: "100%", padding: "14px 18px", borderRadius: 12,
              border: "1.5px solid #fecaca", background: "#fff",
              cursor: "pointer", transition: "all 0.18s",
              fontFamily: "inherit", textAlign: "left",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#fef2f2"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#fca5a5"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#fff"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#fecaca"; }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: "1.3rem" }}>🗑️</span>
              <div>
                <div style={{ fontWeight: 800, color: "#b91c1c", fontSize: "0.95rem" }}>Delete Account</div>
                <div style={{ color: "#b91c1c", opacity: 0.7, fontSize: "0.82rem", marginTop: 2 }}>Permanently delete your account and all data</div>
              </div>
            </div>
            <span style={{ color: "#b91c1c", fontWeight: 700, fontSize: "0.85rem" }}>→</span>
          </button>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 720px) {
          :global(.upgrade-plans-grid) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
