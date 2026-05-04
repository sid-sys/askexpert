"use client";

import { useAuth } from "@/context/AuthContext";
import { useProfileSettings } from "@/app/profile/useProfileSettings";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function UpgradePage() {
  const { user, userProfile, loading } = useAuth();
  const router = useRouter();
  
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  if (loading || !user) return <div style={{ padding: 40, color: "white" }}>Loading...</div>;

  const platformPlan = (userProfile as any)?.platformPlan ?? "free";

  const handleManagePlan = async () => {
    if (!user) return;
    setPortalLoading(true);
    try {
      const { getIdToken } = await import("firebase/auth");
      const token = await getIdToken(user as any);
      const res   = await fetch("/api/stripe/billing-portal", {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}` },
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

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "40px 24px" }}>
      <div className="card-brutal">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{ background: "var(--purple-light)", color: "var(--purple)", width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", border: "2px solid rgba(124,58,237,0.2)" }}>🚀</div>
          <h2 className="font-display" style={{ fontSize: "1.8rem", color: "var(--text-dark)", margin: 0 }}>Your Plan</h2>
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", marginBottom: 30, maxWidth: 500 }}>Your plan determines your platform fee. Upgrade to keep more of what you earn and unlock premium features.</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
          {([
            {
              plan: "free" as const, label: "Free", price: "$0", period: "forever",
              fee: "15%", feeLabel: "per transaction", accent: "var(--text-muted)", accentBg: "#f3f4f6",
              perks: ["Public creator profile", "Unlimited questions", "Pay-per-question & monthly sub", "Up to $1,000/mo earnings"],
            },
            {
              plan: "creator" as const, label: "Creator", price: "$4.99", period: "per month",
              fee: "5%", feeLabel: "per transaction", accent: "var(--purple)", accentBg: "var(--purple-light)",
              perks: ["Everything in Free", "Custom profile branding", "Priority support", "Up to $10,000/mo earnings"],
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
                {!isCurrent && (
                  <button
                    onClick={handleManagePlan}
                    disabled={portalLoading}
                    className="btn-brutal"
                    style={{
                      width: "100%", padding: "12px 0", fontSize: "0.95rem",
                      borderColor: accent,
                      background: isUpgrade ? accent : "transparent",
                      color: isUpgrade ? "#fff" : accent,
                    }}
                  >
                    {portalLoading ? "Processing..." : isUpgrade ? `Upgrade to ${label} →` : isDowngrade ? `Downgrade to ${label}` : ""}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
