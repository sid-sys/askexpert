"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import Swal from "sweetalert2";
import { useAuth } from "@/context/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { COLLECTIONS, SocialLink } from "@/lib/types";
import gsap from "gsap";

// Components
import ProfileTab from "@/components/profile/ProfileTab";
import PricingTab from "@/components/profile/PricingTab";
import PayoutTab from "@/components/profile/PayoutTab";
import LivePreview from "@/components/profile/LivePreview";
// import OnboardingTour from "@/components/OnboardingTour";
import { useProfileSettings } from "./useProfileSettings";

type Tab = "profile" | "pricing" | "payout" | "preview";

const RESPONSE_TIME_OPTIONS = [
  { label: "3 minutes",  value: 3 / 60 },
  { label: "5 minutes",  value: 5 / 60 },
  { label: "15 minutes", value: 15 / 60 },
  { label: "30 minutes", value: 30 / 60 },
  { label: "1 hour",     value: 1 },
  { label: "3 hours",    value: 3 },
  { label: "6 hours",    value: 6 },
  { label: "12 hours",   value: 12 },
  { label: "24 hours",   value: 24 },
  { label: "48 hours",   value: 48 },
  { label: "72 hours",   value: 72 },
  { label: "1 week",     value: 168 },
];
const PERK_TEMPLATES = [
  "⚡ Priority answers — I respond to subscribers first",
  "📝 Longer, more detailed answers for subscribers",
  "🎯 Guaranteed response within my stated time",
  "📬 Ask unlimited questions per month",
];

const ALL_CATEGORIES = [
  "💼 Business", "💡 Startups", "💰 Finance", "📈 Marketing",
  "🛠️ Tech / Dev", "🎨 Design", "📸 Content Creation", "🎯 Career",
  "🏋️ Health & Fitness", "🧠 Mindset", "❤️ Relationships", "🌍 Travel",
];
const CURRENCY_SYMBOLS: Record<string, string> = {
  usd: "$",
  gbp: "£",
  eur: "€",
  inr: "₹",
  cad: "CA$",
  aud: "AU$",
  sgd: "S$",
};

function SaveButton({ saving, saved, onClick }: { saving: boolean; saved: boolean; onClick: () => Promise<void> }) {
  return (
    <div style={{ marginTop: 32, display: "flex", alignItems: "center", gap: 16 }}>
      <button
        onClick={onClick}
        disabled={saving}
        style={{
          display: "inline-flex", alignItems: "center", gap: 10,
          padding: "13px 36px",
          background: saved
            ? "linear-gradient(135deg, #059669, #10b981)"
            : "linear-gradient(135deg, #7c3aed, #a855f7)",
          color: "#fff",
          border: "none",
          borderRadius: 14,
          fontFamily: "'Outfit', sans-serif",
          fontWeight: 800,
          fontSize: "0.95rem",
          cursor: saving ? "wait" : "pointer",
          boxShadow: saved
            ? "0 4px 14px rgba(5,150,105,0.3)"
            : "0 4px 14px rgba(124,58,237,0.3)",
          transition: "all 0.22s cubic-bezier(0.4,0,0.2,1)",
          opacity: saving ? 0.8 : 1,
          letterSpacing: "-0.01em",
        }}
        onMouseEnter={e => { if (!saving) (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = ""; }}
      >
        {saving ? (
          <>
            <span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block", flexShrink: 0 }} />
            Saving…
          </>
        ) : saved ? (
          <>
            <svg width="17" height="17" fill="none" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Saved!
          </>
        ) : (
          <>
            <svg width="17" height="17" fill="none" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke="#fff" strokeWidth="2" strokeLinejoin="round"/><polyline points="17 21 17 13 7 13 7 21" stroke="#fff" strokeWidth="2" strokeLinejoin="round"/><polyline points="7 3 7 8 15 8" stroke="#fff" strokeWidth="2" strokeLinejoin="round"/></svg>
            Save Changes
          </>
        )}
      </button>
      {saved && (
        <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: "0.82rem", fontWeight: 600, color: "#059669" }}>
          ✓ All changes saved
        </span>
      )}
    </div>
  );
}

function SettingsContent() {
  const { user, userProfile, loading, refreshProfile } = useAuth();
  const router       = useRouter();
  const searchParams = useSearchParams();
  const iframeRef    = useRef<HTMLIFrameElement>(null);
  const isInitialized = useRef(false);

  const {
    displayName, setDisplayName,
    tagline, setTagline,
    bio, setBio,
    newUsername, setNewUsername,
    usernameStatus, confirmUsername,
    responseFormats, setResponseFormats,
    categories, setCategories,
    socialLinks, setSocialLinks,
    perQ, setPerQ,
    monthly, setMonthly,
    currency, setCurrency,
    responseTimeHours, setResponseTimeHours,
    subscriberPerks, setSubscriberPerks,
    pppEnabled, setPppEnabled,
    payoutMethod, setPayoutMethod,
    bankName, setBankName,
    accountHolder, setAccountHolder,
    accountNumber, setAccountNumber,
    bankCountry, setBankCountry,
    ifscCode, setIfscCode,
    swiftCode, setSwiftCode,
    paypalEmail, setPaypalEmail,
    wiseEmail, setWiseEmail,
    vacationMode, setVacationMode,
    vacationUntil, setVacationUntil,
    vacationMessage, setVacationMessage,
    saving, saved, saveNow
  } = useProfileSettings();

  const [tab, setTab] = useState<Tab>("profile");
  const [newPerk, setNewPerk] = useState("");
  const [portalLoading, setPortalLoading] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);

  // Payout / Plan data
  const totalEarnings     = (userProfile as any)?.totalEarnings     ?? 0;
  const pendingBalance    = (userProfile as any)?.pendingPayoutBalance ?? 0;
  const platformPlan      = (userProfile as any)?.platformPlan      ?? "free";
  const feePercent        = platformPlan === "pro" ? 0 : platformPlan === "creator" ? 5 : 15;
  const creatorKeepsPct   = 100 - feePercent;
  const payoutUnlocked    = totalEarnings >= 5000;
  const earningsFormatted = `$${(totalEarnings / 100).toFixed(2)}`;
  const progressPct       = Math.min(100, (totalEarnings / 5000) * 100);

  // ── redirect if not logged in ──────────────────────────────────────────────
  useEffect(() => {
    if (!loading && !user) router.push("/auth");
  }, [user, loading, router]);

  // ── read ?tab= from URL ────────────────────────────────────────────────────
  useEffect(() => {
    const t = searchParams?.get("tab");
    setTab((t === "pricing" || t === "payout") ? t : "profile");
  }, [searchParams]);

  // ── send live preview data via postMessage ────────────────────────────────
  const pushPreview = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: "__PREVIEW__",
        data: {
          displayName, tagline, bio, categories, responseFormats,
          socialLinks, perQuestionPrice: perQ, monthlyPrice: monthly,
          responseTimeHours, subscriberPerks, currency, pppEnabled,
        },
      },
      "*"
    );
  }, [displayName, tagline, bio, categories, responseFormats, socialLinks, perQ, monthly, responseTimeHours, subscriberPerks, pppEnabled]);

  useEffect(() => { pushPreview(); }, [pushPreview]);

  // ── save + refresh preview ────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    await saveNow();
    if (iframeRef.current && userProfile?.username) {
      // Reload iframe to fetch freshly-saved Firestore data, onLoad re-applies overlay
      iframeRef.current.src = `/${userProfile.username}`;
    }
  }, [saveNow, userProfile?.username]);

  useEffect(() => {
    gsap.fromTo(".settings-layout", 
      { opacity: 0, y: 30 }, 
      { opacity: 1, y: 0, duration: 0.8, ease: "power3.out", delay: 0.2 }
    );
    gsap.fromTo(".settings-header",
      { opacity: 0, x: -30 },
      { opacity: 1, x: 0, duration: 0.6, ease: "power2.out" }
    );
  }, []);

  // ── handlers ───────────────────────────────────────────────────────────────
  const toggleCategory = (c: string) => {
    setCategories(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  };
  const addPerk = () => {
    if (!newPerk.trim()) return;
    setSubscriberPerks(prev => [...prev, newPerk.trim()]);
    setNewPerk("");
  };
  const removePerk = (index: number) => {
    setSubscriberPerks(prev => prev.filter((_, i) => i !== index));
  };


  const handleManagePlan = async () => {
    if (!user) return;
    setPortalLoading(true);
    try {
      const { getIdToken } = await import("firebase/auth");
      const token = await getIdToken(user);
      const res   = await fetch("/api/stripe/billing-portal", {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Billing portal failed");
      if (data.url) {
        if (window.top !== window.self) window.top!.location.href = data.url;
        else window.location.href = data.url;
      }
    } catch (err: any) {
      alert(err.message || "Could not open billing portal. Try again.");
    } finally {
      setPortalLoading(false);
    }
  };

  const handlePayoutSetup = async () => {
    if (!user) return;
    setStripeLoading(true);
    try {
      const { getIdToken } = await import("firebase/auth");
      const token = await getIdToken(user);
      const res   = await fetch("/api/stripe/connect", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Connection failed");
      
      if (data.url) {
        if (window.top !== window.self) window.top!.location.href = data.url;
        else window.location.href = data.url;
      } else {
        throw new Error("No redirect URL received from Stripe.");
      }
    } catch (err: any) {
      console.error("Payout setup error:", err);
      alert(err.message || "Failed to connect payout. Try again.");
    } finally {
      setStripeLoading(false);
    }
  };

  if (loading || (user && !userProfile)) {
    return (
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "60px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <div className="skeleton" style={{ width: 250, height: 48, borderRadius: 8, marginBottom: 8 }} />
            <div className="skeleton" style={{ width: 180, height: 20, borderRadius: 4 }} />
          </div>
          <div className="skeleton" style={{ width: 140, height: 40, borderRadius: 99 }} />
        </div>
        <div style={{ display: "flex", gap: 32 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
             <div className="skeleton" style={{ width: 280, height: 38, borderRadius: 99, marginBottom: 8 }} />
             <div className="skeleton" style={{ width: "100%", height: 120, borderRadius: 14 }} />
             <div className="skeleton" style={{ width: "100%", height: 300, borderRadius: 14 }} />
          </div>
        </div>
      </div>
    );
  }

  const tabStyle = (t: Tab) => ({
    padding: "0.55rem 1.4rem",
    fontFamily: "'Inter', sans-serif",
    fontWeight: 700,
    fontSize: "0.88rem",
    border: `1.5px solid ${tab === t ? "#7c3aed" : "#e5e7eb"}`,
    background: tab === t ? "#7c3aed" : "#fff",
    color: tab === t ? "#fff" : "#6b7280",
    borderRadius: 99,
    cursor: "pointer",
    transition: "all 0.18s",
    boxShadow: tab === t ? "0 4px 14px rgba(124,58,237,0.25)" : "0 1px 4px rgba(0,0,0,0.06)",
  } as React.CSSProperties);

  return (
    <div className="settings-page" style={{ maxWidth: previewVisible ? 1300 : 1011, margin: "0 auto", padding: "60px 24px", transition: "all 0.3s", position: "relative" }}>
      {/* Onboarding Tour disabled by user request */}
      {/* <OnboardingTour userId={user?.uid} /> */}
      

      {/* ── HEADER ── */}
      <div className="settings-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "clamp(1.8rem, 3vw, 2.4rem)", fontWeight: 800, color: "#1f2937", marginBottom: 6, textTransform: "capitalize" }}>
            Settings
          </h1>
          <p style={{ color: "var(--muted)", margin: 0 }}>Manage your public profile</p>
        </div>
        {/* Live preview only makes sense for tabs that change the public
            profile page (Profile / Pricing). It's hidden on Payout because
            payout settings aren't visible on the creator's public profile. */}
        {tab !== "payout" && (
          <button
            id="btn-preview-toggle"
            onClick={() => setPreviewVisible(v => !v)}
            style={{
              padding: "0.6rem 1.4rem", fontWeight: 700, fontSize: "0.85rem",
              border: `1.5px solid ${previewVisible ? "#7c3aed" : "#e5e7eb"}`,
              background: previewVisible ? "#7c3aed" : "#fff",
              color: previewVisible ? "#fff" : "#6b7280",
              borderRadius: 99, cursor: "pointer", transition: "all 0.18s",
              boxShadow: previewVisible ? "0 4px 14px rgba(124,58,237,0.25)" : "0 1px 4px rgba(0,0,0,0.06)",
            }}
          >
            {previewVisible ? "✕ Hide Preview" : "👁️ Live Preview"}
          </button>
        )}
      </div>

      <div className="settings-layout" style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
        {/* ── FORM PANEL ── */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {tab === "profile" && (
            <>
              <ProfileTab
                displayName={displayName} setDisplayName={setDisplayName}
                tagline={tagline} setTagline={setTagline}
                bio={bio} setBio={setBio}
                newUsername={newUsername} setNewUsername={setNewUsername}
                usernameStatus={usernameStatus} handleSave={confirmUsername}
                saving={saving} saved={saved} userProfile={userProfile}
                socialLinks={socialLinks} setSocialLinks={setSocialLinks}
                categories={categories} toggleCategory={toggleCategory}
                vacationMode={vacationMode} setVacationMode={setVacationMode}
                vacationUntil={vacationUntil} setVacationUntil={setVacationUntil}
                vacationMessage={vacationMessage} setVacationMessage={setVacationMessage}
                ALL_CATEGORIES={ALL_CATEGORIES}
              />
              <SaveButton saving={saving} saved={saved} onClick={handleSave} />
            </>
          )}

          {tab === "pricing" && (
            <>
              <PricingTab
                currency={currency} setCurrency={setCurrency}
                perQ={perQ} setPerQ={setPerQ}
                monthly={monthly} setMonthly={setMonthly}
                CURRENCY_SYMBOLS={CURRENCY_SYMBOLS}
                feePercent={feePercent} creatorKeepsPct={creatorKeepsPct}
                platformPlan={platformPlan} pppEnabled={pppEnabled}
                setPppEnabled={setPppEnabled} subscriberPerks={subscriberPerks}
                setSubscriberPerks={setSubscriberPerks} newPerk={newPerk}
                setNewPerk={setNewPerk} addPerk={addPerk} removePerk={removePerk}
                PERK_TEMPLATES={PERK_TEMPLATES} responseTimeHours={responseTimeHours}
                setResponseTimeHours={setResponseTimeHours}
                RESPONSE_TIME_OPTIONS={RESPONSE_TIME_OPTIONS}
              />
              <SaveButton saving={saving} saved={saved} onClick={handleSave} />
            </>
          )}

          {tab === "payout" && (
            <>
              <PayoutTab
                platformPlan={platformPlan} portalLoading={portalLoading}
                handleManagePlan={handleManagePlan} pendingBalance={pendingBalance}
                totalEarnings={totalEarnings} payoutMethod={payoutMethod}
                setPayoutMethod={setPayoutMethod} userProfile={userProfile}
                handlePayoutSetup={handlePayoutSetup} stripeLoading={stripeLoading}
                accountHolder={accountHolder} setAccountHolder={setAccountHolder}
                bankName={bankName} setBankName={setBankName}
                accountNumber={accountNumber} setAccountNumber={setAccountNumber}
                bankCountry={bankCountry} setBankCountry={setBankCountry}
                ifscCode={ifscCode} setIfscCode={setIfscCode}
                swiftCode={swiftCode} setSwiftCode={setSwiftCode}
                paypalEmail={paypalEmail} setPaypalEmail={setPaypalEmail}
                wiseEmail={wiseEmail} setWiseEmail={setWiseEmail}
                payoutUnlocked={payoutUnlocked}
                earningsFormatted={earningsFormatted}
                progressPct={progressPct}
              />
              <SaveButton saving={saving} saved={saved} onClick={handleSave} />
            </>
          )}
        </div>

        {/* ── LIVE PREVIEW PANEL ── */}
        {previewVisible && (
          <LivePreview 
            iframeRef={iframeRef} 
            username={userProfile?.username || ""} 
            pushPreview={pushPreview} 
          />
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>Loading Settings...</div>}>
      <SettingsContent />
    </Suspense>
  );
}
