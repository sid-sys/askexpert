"use client";

interface PricingTabProps {
  currency: string;
  setCurrency: (v: string) => void;
  perQ: number;
  setPerQ: (v: number) => void;
  monthly: number;
  setMonthly: (v: number) => void;
  CURRENCY_SYMBOLS: Record<string, string>;
  feePercent: number;
  creatorKeepsPct: number;
  platformPlan: string;
  subscriberPerks: string[];
  setSubscriberPerks: React.Dispatch<React.SetStateAction<string[]>>;
  newPerk: string;
  setNewPerk: (v: string) => void;
  addPerk: () => void;
  removePerk: (i: number) => void;
  PERK_TEMPLATES: string[];
  responseTimeHours: number;
  setResponseTimeHours: (v: number) => void;
  RESPONSE_TIME_OPTIONS: { label: string; value: number }[];
}

const labelStyle: React.CSSProperties = {
  display: "block",
  color: "var(--muted)",
  fontSize: "0.8rem",
  fontWeight: 700,
  textTransform: "uppercase",
  marginBottom: 6,
};

function chipStyle(active: boolean, color: "purple" | "orange"): React.CSSProperties {
  const primaryColor = color === "purple" ? "#7c3aed" : "#f59e0b";
  const shadowColor  = color === "purple" ? "rgba(124,58,237,0.25)" : "rgba(245,158,11,0.25)";
  return {
    padding: "0.5rem 1.1rem",
    fontFamily: "'Inter', sans-serif",
    fontSize: "0.85rem",
    fontWeight: 700,
    borderRadius: 99,
    border: `1.5px solid ${active ? primaryColor : "#e5e7eb"}`,
    background: active ? primaryColor : "#fff",
    color: active ? "#fff" : "#6b7280",
    cursor: "pointer",
    transition: "all 0.18s",
    boxShadow: active ? `0 4px 12px ${shadowColor}` : "0 1px 4px rgba(0,0,0,0.04)",
  };
}

export default function PricingTab({
  currency, setCurrency, perQ, setPerQ, monthly, setMonthly, CURRENCY_SYMBOLS,
  feePercent, creatorKeepsPct, platformPlan,
  subscriberPerks, setSubscriberPerks, newPerk, setNewPerk, addPerk, removePerk,
  PERK_TEMPLATES, responseTimeHours, setResponseTimeHours, RESPONSE_TIME_OPTIONS
}: PricingTabProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* PRICING */}
      <div className="card-brutal card-brutal-green">
        <h2 className="font-display" style={{ fontSize: "1.5rem", color: "var(--green)", marginBottom: 16 }}>
          Pricing
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div>
            <label style={labelStyle}>Per Question ({CURRENCY_SYMBOLS[currency] || "$"})</label>
            <input
              className="input-brutal" type="number" min={1} step={0.5}
              value={(isNaN(perQ) ? 500 : perQ) / 100}
              onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setPerQ(Math.round(v * 100)); }}
            />
            <p style={{ color: "var(--muted)", fontSize: "0.75rem", marginTop: 4 }}>
              You receive: {CURRENCY_SYMBOLS[currency] || "$"}{((perQ * (1 - feePercent / 100)) / 100).toFixed(2)}
            </p>
          </div>
          <div>
            <label style={labelStyle}>Monthly Sub ({CURRENCY_SYMBOLS[currency] || "$"})</label>
            <input
              className="input-brutal" type="number" min={1} step={0.5}
              value={(isNaN(monthly) ? 1000 : monthly) / 100}
              onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setMonthly(Math.round(v * 100)); }}
            />
            <p style={{ color: "var(--muted)", fontSize: "0.75rem", marginTop: 4 }}>
              You receive: {CURRENCY_SYMBOLS[currency] || "$"}{((monthly * (1 - feePercent / 100)) / 100).toFixed(2)}
            </p>
          </div>
        </div>
        <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: 16, padding: "10px 14px", background: "rgba(0,0,0,0.06)", borderRadius: 6 }}>
          💡 Platform fee: <strong>{feePercent}%</strong> ({platformPlan === "free" ? "Free plan" : platformPlan === "creator" ? "Creator plan" : "Pro plan"}). You keep <strong>{creatorKeepsPct}%</strong> of every payment.
          {feePercent > 0 && <> Upgrade your plan below to reduce fees.</>}
        </p>

        {/* Read-only currency display. The picker was removed — billing
            currency is now locked to the creator's country (India → INR
            via Razorpay, everyone else → USD via Stripe). Letting creators
            mix and match led to mismatches between their bank country and
            the gateway used to settle. */}
        <div style={{ marginTop: 16 }}>
          <label style={labelStyle}>Billing Currency</label>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "10px 16px", borderRadius: 10,
            background: "rgba(0,0,0,0.04)", color: "var(--text)",
            fontWeight: 700, fontSize: "0.95rem", border: "1px solid rgba(0,0,0,0.08)",
          }}>
            <span>{currency.toUpperCase()}</span>
            <span style={{ color: "var(--muted)", fontSize: "0.78rem", fontWeight: 500 }}>
              · auto-set from your country
            </span>
          </div>
          <p style={{ color: "var(--muted)", fontSize: "0.75rem", marginTop: 6 }}>
            Askers are charged in this currency. Contact support if you need it changed.
          </p>
        </div>

      </div>

      {/* SUBSCRIBER PERKS */}
      <div className="card-brutal card-brutal-purple">
        <h2 className="font-display" style={{ fontSize: "1.5rem", color: "var(--purple)", marginBottom: 8 }}>
          Subscriber Perks
        </h2>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: 16 }}>
          Tell your fans exactly what they get when they subscribe monthly! (e.g. &quot;Exclusive Content&quot;, &quot;Monthly Group Call&quot;)
        </p>
        
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <input 
            className="input-brutal" 
            placeholder="e.g. Direct message access"
            value={newPerk}
            onChange={e => setNewPerk(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addPerk()}
          />
          <button className="btn-purple" onClick={addPerk} style={{ padding: "0 20px" }}>Add</button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <p style={{ color: "var(--muted)", fontSize: "0.75rem", marginBottom: 8, fontWeight: 700, textTransform: "uppercase" }}>Templates:</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PERK_TEMPLATES.map(pt => (
              <button 
                key={pt} 
                onClick={() => !subscriberPerks.includes(pt) && setSubscriberPerks(p => [...p, pt])}
                style={{
                  padding: "4px 10px", fontSize: "0.75rem", borderRadius: 99,
                  border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer",
                  opacity: subscriberPerks.includes(pt) ? 0.5 : 1
                }}
              >
                {pt}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {subscriberPerks.map((p, i) => (
            <div key={i} style={{ 
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 14px", background: "#f8f0ff", border: "1.5px solid #e9d5ff",
              borderRadius: 10
            }}>
              <span style={{ fontWeight: 600, color: "var(--purple)" }}>✨ {p}</span>
              <button 
                onClick={() => removePerk(i)}
                style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: "1.2rem" }}
              >
                &times;
              </button>
            </div>
          ))}
          {subscriberPerks.length === 0 && (
            <p style={{ color: "var(--muted)", fontSize: "0.85rem", textAlign: "center", padding: 12, border: "2px dashed #e5e7eb", borderRadius: 10 }}>
              No perks added yet. Add some to boost your subscriptions! 🚀
            </p>
          )}
        </div>
      </div>

      {/* RESPONSE TIME */}
      <div className="card-brutal card-brutal-orange">
        <h2 className="font-display" style={{ fontSize: "1.4rem", color: "var(--orange)", marginBottom: 8 }}>
          Response Guarantee
        </h2>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: 16 }}>
          How long you have to answer before the asker gets an <strong>automatic refund</strong>.
          This is shown to askers before they pay.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {RESPONSE_TIME_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setResponseTimeHours(opt.value)}
              style={chipStyle(responseTimeHours === opt.value, "orange")}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div style={{
          marginTop: 20, padding: "14px 16px",
          background: "rgba(249,115,22,0.08)",
          border: "2px solid var(--orange)",
          borderRadius: 8,
        }}>
          <p style={{ color: "var(--orange)", fontWeight: 700, fontSize: "0.9rem", margin: 0 }}>
            ⏳ Askers see: &quot;Auto-refunded if not answered within {RESPONSE_TIME_OPTIONS.find(o => o.value === responseTimeHours)?.label}&quot;
          </p>
        </div>
      </div>
    </div>
  );
}
