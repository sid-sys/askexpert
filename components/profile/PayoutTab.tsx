"use client";

import Swal from "sweetalert2";

interface PayoutTabProps {
  platformPlan: string;
  totalEarnings: number;
  pendingBalance: number;
  payoutUnlocked: boolean;
  earningsFormatted: string;
  progressPct: number;
  // ── Earnings breakdown (computed in the parent against current fee tier) ──
  feePercent: number;
  platformCutCents: number;
  creatorNetCents: number;
  // ── Lifetime cap / auto-upgrade state (null = not yet checked) ───────────
  lifetimeEarningsCents: number | null;
  lifetimeCapCents: number | null;
  exceededCap: boolean;
  upgradedTo?: string;
  paymentDue: boolean;
  paymentDueCents: number;
  handleManagePlan: () => void;
  portalLoading: boolean;
  userProfile: any;
  handlePayoutSetup: () => void;
  stripeLoading: boolean;
  payoutMethod: "stripe_connect" | "local_bank" | "international_bank" | "paypal" | "wise" | "manual_bank";
  setPayoutMethod: (v: any) => void;
  accountHolder: string;
  setAccountHolder: (v: string) => void;
  bankName: string;
  setBankName: (v: string) => void;
  accountNumber: string;
  setAccountNumber: (v: string) => void;
  bankCountry: string;
  setBankCountry: (v: string) => void;
  ifscCode: string;
  setIfscCode: (v: string) => void;
  swiftCode: string;
  setSwiftCode: (v: string) => void;
  paypalEmail: string;
  setPaypalEmail: (v: string) => void;
  wiseEmail: string;
  setWiseEmail: (v: string) => void;
}

function formatCents(c: number): string {
  return `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const labelStyle: React.CSSProperties = {
  display: "block",
  color: "var(--text-dark)",
  fontSize: "0.85rem",
  fontWeight: 700,
  textTransform: "uppercase",
  marginBottom: 8,
  letterSpacing: "0.05em",
};

function chipStyle(active: boolean, color: "purple" | "green" | "orange"): React.CSSProperties {
  const primaryColor = color === "purple" ? "var(--purple)" : color === "green" ? "var(--green)" : "var(--orange)";
  return {
    padding: "0.8rem 1.4rem",
    fontFamily: "var(--font-main)",
    fontSize: "0.95rem",
    fontWeight: 800,
    borderRadius: 12,
    border: `2px solid ${active ? primaryColor : "var(--border)"}`,
    background: active ? primaryColor : "#fff",
    color: active ? "#fff" : "var(--text-dark)",
    cursor: "pointer",
    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
    boxShadow: active ? `4px 4px 0px rgba(0,0,0,0.1)` : "2px 2px 0px rgba(0,0,0,0.05)",
    transform: active ? "translateY(-2px)" : "none",
  };
}

export default function PayoutTab({
  platformPlan, totalEarnings, pendingBalance, payoutUnlocked, earningsFormatted, progressPct,
  feePercent, platformCutCents, creatorNetCents,
  lifetimeEarningsCents, lifetimeCapCents, exceededCap, upgradedTo,
  paymentDue, paymentDueCents,
  handleManagePlan, portalLoading, userProfile, handlePayoutSetup, stripeLoading,
  payoutMethod, setPayoutMethod, accountHolder, setAccountHolder, bankName, setBankName,
  accountNumber, setAccountNumber, bankCountry, setBankCountry, ifscCode, setIfscCode,
  swiftCode, setSwiftCode, paypalEmail, setPaypalEmail, wiseEmail, setWiseEmail
}: PayoutTabProps) {
  const planLabel = platformPlan === "pro" ? "Pro" : platformPlan === "creator" ? "Creator" : "Free";
  const lifetimePct = lifetimeEarningsCents != null && lifetimeCapCents != null && isFinite(lifetimeCapCents)
    ? Math.min(100, (lifetimeEarningsCents / lifetimeCapCents) * 100)
    : 0;
  const lifetimeOver80 = lifetimePct >= 80;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>

      {/* PAYMENT DUE BANNER — auto-upgrade ran but couldn't deduct fee from
          accrued earnings. Creator can't reply to new questions until they
          resolve it. Shown above everything so it's impossible to miss. */}
      {paymentDue && (
        <div style={{
          background: "linear-gradient(135deg, #fef2f2, #fff)",
          border: "2px solid #fca5a5", borderRadius: 16, padding: "18px 22px",
          display: "flex", gap: 14, alignItems: "flex-start",
        }}>
          <span style={{ fontSize: "1.6rem" }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--font-main)", fontWeight: 900, color: "#b91c1c", fontSize: "1rem", marginBottom: 4 }}>
              Plan fee unpaid — replies are paused
            </div>
            <div style={{ color: "#7f1d1d", fontSize: "0.88rem", lineHeight: 1.55 }}>
              You exceeded your <strong>{planLabel}</strong> plan's lifetime earning cap, so we
              tried to bump you to the next tier from your accrued earnings.
              You're short by <strong>{formatCents(paymentDueCents)}</strong>. Until this is
              settled, you can't reply to new questions, but fans can still ask.
            </div>
            <button onClick={handleManagePlan} disabled={portalLoading}
              className="btn-brutal" style={{
                marginTop: 12, padding: "10px 20px", fontSize: "0.9rem",
                background: "#b91c1c", color: "#fff", borderColor: "#b91c1c",
              }}>
              {portalLoading ? "Opening…" : "Resolve in Billing →"}
            </button>
          </div>
        </div>
      )}

      {upgradedTo && upgradedTo !== platformPlan && (
        <div style={{
          background: "linear-gradient(135deg, #ecfdf5, #fff)",
          border: "2px solid #6ee7b7", borderRadius: 16, padding: "16px 22px",
          display: "flex", gap: 14, alignItems: "flex-start",
        }}>
          <span style={{ fontSize: "1.4rem" }}>🎉</span>
          <div>
            <div style={{ fontFamily: "var(--font-main)", fontWeight: 900, color: "#047857", fontSize: "0.95rem" }}>
              Auto-upgraded to {upgradedTo === "pro" ? "Pro" : "Creator"}
            </div>
            <div style={{ color: "#065f46", fontSize: "0.85rem", lineHeight: 1.5, marginTop: 2 }}>
              You hit your lifetime cap so we moved you to the next tier and
              deducted the subscription fee from your accrued earnings.
            </div>
          </div>
        </div>
      )}

      {/* EARNINGS BREAKDOWN — current fee tier + how the lifetime gross splits */}
      <div className="card-brutal">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{ background: "var(--bg-soft)", color: "var(--text-dark)", width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", border: "2px solid var(--border)" }}>💰</div>
          <h2 className="font-display" style={{ fontSize: "1.4rem", color: "var(--text-dark)", margin: 0 }}>Earnings Breakdown</h2>
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: 18 }}>
          You're on the <strong>{planLabel}</strong> plan — current platform fee is
          {" "}<strong style={{ color: feePercent === 0 ? "#10b981" : feePercent <= 5 ? "#7c3aed" : "#f59e0b" }}>{feePercent}% per transaction</strong>.
          {" "}Lifetime totals below sum each payment at the fee tier active at the time.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
          <div style={{ background: "#fff", border: "2px solid var(--border)", borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Lifetime Gross</div>
            <div style={{ fontFamily: "var(--font-main)", fontWeight: 900, fontSize: "1.6rem", color: "var(--text-dark)", marginTop: 4 }}>{formatCents(totalEarnings)}</div>
          </div>
          <div style={{ background: "#fff", border: "2px solid var(--border)", borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Your Net</div>
            <div style={{ fontFamily: "var(--font-main)", fontWeight: 900, fontSize: "1.6rem", color: "#10b981", marginTop: 4 }}>{formatCents(creatorNetCents)}</div>
          </div>
          <div style={{ background: "#fff", border: "2px solid var(--border)", borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Platform Fee</div>
            <div style={{ fontFamily: "var(--font-main)", fontWeight: 900, fontSize: "1.6rem", color: "#f59e0b", marginTop: 4 }}>{formatCents(platformCutCents)}</div>
          </div>
        </div>
      </div>

      {/* LIFETIME CAP — total earnings vs current plan limit */}
      {lifetimeEarningsCents != null && lifetimeCapCents != null && (
        <div className="card-brutal" style={{ borderColor: exceededCap ? "#fca5a5" : lifetimeOver80 ? "#fbbf24" : "var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <div style={{ background: "var(--bg-soft)", color: "var(--text-dark)", width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", border: "2px solid var(--border)" }}>📈</div>
            <h2 className="font-display" style={{ fontSize: "1.4rem", color: "var(--text-dark)", margin: 0 }}>Plan Cap</h2>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginBottom: 14 }}>
            Lifetime earnings against your {planLabel} plan's cap.
            {isFinite(lifetimeCapCents) ? null : <> Pro plan is uncapped.</>}
          </p>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <span style={{ fontFamily: "var(--font-main)", fontWeight: 900, fontSize: "1.4rem", color: exceededCap ? "#b91c1c" : "var(--text-dark)" }}>
              {formatCents(lifetimeEarningsCents)}
            </span>
            <span style={{ color: "var(--text-muted)", fontSize: "0.85rem", fontWeight: 600 }}>
              of {isFinite(lifetimeCapCents) ? formatCents(lifetimeCapCents) : "∞"} cap
            </span>
          </div>
          {isFinite(lifetimeCapCents) && (
            <div style={{ height: 12, background: "#f3f4f6", borderRadius: 99, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${lifetimePct}%`,
                background: exceededCap ? "#b91c1c" : lifetimeOver80 ? "#f59e0b" : "var(--purple)",
                transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
              }} />
            </div>
          )}
          {exceededCap && !paymentDue && upgradedTo && upgradedTo !== platformPlan && (
            <p style={{ color: "#065f46", fontSize: "0.85rem", marginTop: 10, fontWeight: 600 }}>
              ✅ Cap reached — we already moved you to the {upgradedTo} tier.
            </p>
          )}
          {lifetimeOver80 && !exceededCap && (
            <p style={{ color: "#92400e", fontSize: "0.85rem", marginTop: 10, fontWeight: 600 }}>
              ⚠️ You're approaching your plan's lifetime cap. Upgrade now to avoid an auto-upgrade fee later.
            </p>
          )}
        </div>
      )}

      {/* EARNINGS PROGRESS */}
      <div className="card-brutal-purple">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{ background: "#fff", color: "var(--purple)", width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", border: "2px solid rgba(124,58,237,0.2)" }}>📊</div>
          <h2 className="font-display" style={{ fontSize: "1.8rem", color: "var(--purple)", margin: 0 }}>Lifetime Earnings</h2>
        </div>
        <p style={{ color: "var(--text-dark)", fontSize: "0.95rem", marginBottom: 20, fontWeight: 500 }}>
          Track your total platform earnings. Payouts are processed automatically via your chosen method once they clear escrow.
        </p>
        <div style={{ background: "#fff", border: "2px solid var(--border)", borderRadius: 16, padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, alignItems: "flex-end" }}>
            <div>
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Total Cleared</span>
              <span style={{ fontFamily: "var(--font-main)", fontWeight: 900, fontSize: "2rem", color: "var(--text-dark)", lineHeight: 1 }}>{earningsFormatted}</span>
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Payout Threshold</span>
              <span style={{ fontFamily: "var(--font-main)", fontWeight: 800, fontSize: "1.2rem", color: "var(--text-dark)", lineHeight: 1 }}>$50.00</span>
            </div>
          </div>
          <div style={{ height: 16, background: "#f3f4f6", borderRadius: 99, overflow: "hidden", border: "1px solid inset rgba(0,0,0,0.1)" }}>
            <div style={{
              height: "100%", width: `${progressPct}%`,
              background: payoutUnlocked ? "var(--green)" : "var(--purple)",
              borderRadius: 99, transition: "width 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
            }} />
          </div>
          {payoutUnlocked && (
            <p style={{ color: "var(--green)", fontSize: "0.85rem", marginTop: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
              <span>✅</span> Payout threshold reached! You are eligible for automated transfers.
            </p>
          )}
        </div>
      </div>

      {/* PAYOUT METHOD LOCK BANNER — shown only while the creator is below
          the $50 payout threshold. Sits above the chooser so the reason is
          obvious before the disabled state is encountered. */}
      {!payoutUnlocked && (
        <div style={{
          background: "linear-gradient(135deg, #fef3c7, #fff)",
          border: "2px solid #fbbf24", borderRadius: 16, padding: "16px 22px",
          display: "flex", gap: 14, alignItems: "flex-start",
        }}>
          <span style={{ fontSize: "1.5rem" }}>🔒</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--font-main)", fontWeight: 900, color: "#92400e", fontSize: "1rem", marginBottom: 4 }}>
              Payout method locked
            </div>
            <div style={{ color: "#78350f", fontSize: "0.88rem", lineHeight: 1.55 }}>
              Reach <strong>$50.00</strong> in cleared earnings to unlock payout setup.
              You&apos;ve cleared <strong>{earningsFormatted}</strong> so far —
              <strong> {formatCents(Math.max(0, 5000 - totalEarnings))}</strong> to go.
              Your earnings keep accruing in the meantime and will pay out the moment you cross the threshold.
            </div>
          </div>
        </div>
      )}

      {/* PAYOUT METHOD CHOOSER */}
      <div
        className={`card-brutal ${payoutUnlocked ? "card-brutal-green" : ""}`}
        // When the creator hasn't crossed the $50 payout threshold we lock
        // this whole section. Locking is visual + behavioural: pointer-events
        // off prevents clicks anywhere inside the card (chooser buttons,
        // method-specific config, the Stripe setup CTA), opacity dims it, and
        // a banner above explains *why* with the exact gap remaining.
        style={!payoutUnlocked ? { position: "relative", opacity: 0.55, pointerEvents: "none", filter: "saturate(0.6)" } : undefined}
        aria-disabled={!payoutUnlocked}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{ background: payoutUnlocked ? "rgba(16,185,129,0.1)" : "var(--bg-soft)", color: payoutUnlocked ? "var(--green)" : "var(--text-dark)", width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", border: `2px solid ${payoutUnlocked ? "rgba(16,185,129,0.3)" : "var(--border)"}` }}>💳</div>
          <h2 className="font-display" style={{ fontSize: "1.8rem", color: payoutUnlocked ? "var(--green)" : "var(--text-dark)", margin: 0 }}>
            Payout Method {!payoutUnlocked && <span style={{ fontSize: "1rem", marginLeft: 8 }}>🔒</span>}
          </h2>
        </div>
        <p style={{ color: "var(--text-dark)", fontSize: "0.95rem", marginBottom: 24, fontWeight: 500 }}>
          Choose how you receive your earnings. We recommend Stripe Connect for automated, fast transfers.
        </p>

        <div style={{ display: "flex", gap: 16, marginBottom: 30, flexWrap: "wrap" }}>
          <button
            onClick={() => setPayoutMethod("stripe_connect")}
            style={chipStyle(payoutMethod === "stripe_connect", "purple")}
            disabled={!payoutUnlocked}
          >
            ⚡ Stripe Connect (Auto)
          </button>
          <button
            onClick={() => setPayoutMethod(payoutMethod === "stripe_connect" ? "paypal" : payoutMethod)}
            style={chipStyle(payoutMethod !== "stripe_connect", "green")}
            disabled={!payoutUnlocked}
          >
            🏦 Manual Transfer (Global)
          </button>
        </div>

        {payoutMethod !== "stripe_connect" && (
          <div style={{ marginBottom: 30, padding: 24, border: "2px solid var(--border)", borderRadius: 16, background: "#fafafa" }}>
            <label style={labelStyle}>Select Transfer Service</label>
            <div style={{ position: "relative" }}>
              <select 
                className="input-brutal" 
                value={payoutMethod === "manual_bank" ? "paypal" : payoutMethod} 
                onChange={(e) => setPayoutMethod(e.target.value as any)}
                style={{ width: "100%", cursor: "pointer", background: "#fff", height: 56, fontSize: "1.05rem", fontWeight: 600, appearance: "none" }}
              >
                <optgroup label="✨ Recommended (Fast & Easy)">
                  <option value="paypal">💙 PayPal</option>
                  <option value="wise">🟢 Wise (Low Fees)</option>
                </optgroup>
                <optgroup label="Other Methods">
                  <option value="local_bank">🏦 Local Bank (India IMPS/NEFT)</option>
                  <option value="international_bank">🌍 International Wire (Slower)</option>
                </optgroup>
              </select>
              <div style={{ position: "absolute", right: 20, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: "0.8rem", opacity: 0.5 }}>▼</div>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: 12, fontWeight: 500 }}>
              Wise and PayPal are the easiest methods for receiving funds globally with minimal setup.
            </p>
          </div>
        )}

        <div style={{ background: "#fff", border: "2px solid var(--border)", borderRadius: 16, padding: 24, boxShadow: "4px 4px 0px rgba(0,0,0,0.05)" }}>
          {payoutMethod === "stripe_connect" && (
            <div>
              {userProfile?.stripeOnboardingComplete ? (
                <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <span className="badge badge-green" style={{ fontSize: "0.95rem", padding: "8px 16px" }}>✅ Stripe Connected</span>
                  <div style={{ borderLeft: "2px solid var(--border)", paddingLeft: 16 }}>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", display: "block" }}>Account ID</span>
                    <span style={{ color: "var(--text-dark)", fontSize: "0.95rem", fontFamily: "monospace", fontWeight: 600 }}>{userProfile.stripeAccountId}</span>
                  </div>
                  <button onClick={handlePayoutSetup} disabled={stripeLoading} className="btn-brutal btn-purple" style={{ marginLeft: "auto" }}>
                    {stripeLoading ? "..." : "✏️ Edit Payout Account"}
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
                    {[{ icon: "🏦", title: "Bank Account", desc: "Checking / savings" }, { icon: "💳", title: "Debit Card", desc: "Visa / Mastercard" }, { icon: "🌍", title: "Multi-currency", desc: "140+ countries" }].map(item => (
                      <div key={item.title} style={{ flex: 1, padding: "20px 16px", border: "2px solid var(--border)", borderRadius: 12, minWidth: 140, textAlign: "center", background: "#fafafa" }}>
                        <p style={{ fontSize: "2rem", margin: "0 0 12px" }}>{item.icon}</p>
                        <p style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--text-dark)", margin: "0 0 4px" }}>{item.title}</p>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: 0, fontWeight: 500 }}>{item.desc}</p>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                    <button onClick={handlePayoutSetup} disabled={stripeLoading} className="btn-primary" style={{ padding: "14px 32px", fontSize: "1.1rem" }}>
                      {stripeLoading ? "Redirecting to Stripe..." : "⚡ Set Up Stripe Payout"}
                    </button>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                      🔒 Secured by Stripe. We never store your bank details.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {(payoutMethod === "local_bank" || payoutMethod === "manual_bank") && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ padding: "14px 20px", background: "rgba(124,58,237,0.1)", border: "2px solid var(--purple)", borderRadius: 12, fontSize: "0.95rem", color: "var(--purple)", fontWeight: 600, display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ fontSize: "1.2rem" }}>💡</span>
                <span>Ideal for India (IMPS/NEFT) and regions with direct local transfers. Payouts are processed monthly.</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
                <div>
                  <label style={labelStyle}>Account Holder Name</label>
                  <input className="input-brutal" value={accountHolder} onChange={e => setAccountHolder(e.target.value)} placeholder="Full legal name" />
                </div>
                <div>
                  <label style={labelStyle}>Bank Name</label>
                  <input className="input-brutal" value={bankName} onChange={e => setBankName(e.target.value)} placeholder="e.g. HDFC Bank" />
                </div>
                <div>
                  <label style={labelStyle}>Account Number</label>
                  <input className="input-brutal" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="Account number" />
                </div>
                <div>
                  <label style={labelStyle}>IFSC / Routing Code</label>
                  <input className="input-brutal" value={ifscCode} onChange={e => setIfscCode(e.target.value)} placeholder="e.g. HDFC0001234" />
                </div>
              </div>
            </div>
          )}

          {payoutMethod === "international_bank" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ padding: "14px 20px", background: "rgba(249,115,22,0.1)", border: "2px solid var(--orange)", borderRadius: 12, fontSize: "0.95rem", color: "#c2410c", fontWeight: 600, display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ fontSize: "1.2rem" }}>🌍</span>
                <span>Ideal for international wire transfers (SWIFT/BIC). High bank fees may apply. Payouts are processed monthly.</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Account Holder Name</label>
                  <input className="input-brutal" value={accountHolder} onChange={e => setAccountHolder(e.target.value)} placeholder="Full legal name" />
                </div>
                <div>
                  <label style={labelStyle}>Bank Name</label>
                  <input className="input-brutal" value={bankName} onChange={e => setBankName(e.target.value)} placeholder="e.g. Barclays" />
                </div>
                <div>
                  <label style={labelStyle}>Account Number / IBAN</label>
                  <input className="input-brutal" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="Account number or IBAN" />
                </div>
                <div>
                  <label style={labelStyle}>Country (ISO code)</label>
                  <input className="input-brutal" value={bankCountry} onChange={e => setBankCountry(e.target.value)} placeholder="e.g. GB, US" maxLength={2} style={{ textTransform: "uppercase" }} />
                </div>
                <div>
                  <label style={labelStyle}>SWIFT / BIC Code</label>
                  <input className="input-brutal" value={swiftCode} onChange={e => setSwiftCode(e.target.value)} placeholder="e.g. HDFCINBB" />
                </div>
              </div>
            </div>
          )}

          {payoutMethod === "paypal" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ padding: "14px 20px", background: "rgba(59,130,246,0.1)", border: "2px solid #3b82f6", borderRadius: 12, fontSize: "0.95rem", color: "#1d4ed8", fontWeight: 600, display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ fontSize: "1.2rem" }}>💙</span>
                <span>Receive payouts directly to your PayPal account. Standard PayPal receiving fees may apply. Payouts are processed monthly.</span>
              </div>
              <div>
                <label style={labelStyle}>PayPal Email Address</label>
                <input className="input-brutal" value={paypalEmail} onChange={e => setPaypalEmail(e.target.value)} placeholder="paypal@email.com" type="email" style={{ maxWidth: 400 }} />
              </div>
            </div>
          )}

          {payoutMethod === "wise" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ padding: "14px 20px", background: "rgba(16,185,129,0.1)", border: "2px solid var(--green)", borderRadius: 12, fontSize: "0.95rem", color: "var(--green)", fontWeight: 600, display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ fontSize: "1.2rem" }}>🟢</span>
                <span>Receive payouts directly to your Wise account using your Wise email. Low fees. Payouts are processed monthly.</span>
              </div>
              <div>
                <label style={labelStyle}>Wise Email Address</label>
                <input className="input-brutal" value={wiseEmail} onChange={e => setWiseEmail(e.target.value)} placeholder="wise@email.com" type="email" style={{ maxWidth: 400 }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

