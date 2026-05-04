"use client";

import { SocialLink } from "@/lib/types";

interface ProfileTabProps {
  displayName: string;
  setDisplayName: (v: string) => void;
  tagline: string;
  setTagline: (v: string) => void;
  bio: string;
  setBio: (v: string) => void;
  newUsername: string;
  setNewUsername: (v: string) => void;
  usernameStatus: "idle" | "checking" | "available" | "taken" | "invalid";
  handleSave: () => void;
  saving: boolean;
  saved: boolean;
  userProfile: any;
  socialLinks: SocialLink[];
  setSocialLinks: React.Dispatch<React.SetStateAction<SocialLink[]>>;
  categories: string[];
  toggleCategory: (c: string) => void;
  vacationMode: boolean;
  setVacationMode: (v: boolean) => void;
  vacationUntil: Date | null;
  setVacationUntil: (d: Date | null) => void;
  vacationMessage: string;
  setVacationMessage: (v: string) => void;
  ALL_CATEGORIES: string[];
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

export default function ProfileTab({
  displayName, setDisplayName, tagline, setTagline, bio, setBio,
  newUsername, setNewUsername, usernameStatus, handleSave, saving, saved,
  userProfile, socialLinks, setSocialLinks, categories, toggleCategory,
  vacationMode, setVacationMode, vacationUntil, setVacationUntil, vacationMessage, setVacationMessage,
  ALL_CATEGORIES
}: ProfileTabProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* BASIC INFO */}
      <div className="card-brutal card-brutal-purple">
        <h2 className="font-display" style={{ fontSize: "1.4rem", color: "var(--purple)", marginBottom: 16 }}>
          Basic Info
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>Display Name</label>
            <input className="input-brutal" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your Name" />
          </div>
          <div>
            <label style={labelStyle}>Tagline <span style={{ color: "var(--muted)", fontWeight: 400 }}>(shown under your name)</span></label>
            <input className="input-brutal" value={tagline} onChange={e => setTagline(e.target.value)} placeholder="e.g. Startup founder | 2x exit | Building in public" maxLength={100} />
            <p style={{ color: "var(--muted)", fontSize: "0.75rem", marginTop: 4 }}>{tagline.length}/100</p>
          </div>
          <div>
            <label style={labelStyle}>Bio</label>
            <textarea className="input-brutal textarea-brutal" value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell followers who you are..." style={{ minHeight: 100 }} />
          </div>
          <div>
            <label style={labelStyle}>Your Public URL</label>
            <div id="username-input-group" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ color: "var(--muted)", fontSize: "0.9rem", flexShrink: 0 }}>askexpert.live/</span>
              <input
                className="input-brutal"
                style={{
                  width: 160,
                  borderColor:
                    usernameStatus === "available" ? "var(--green)" :
                    usernameStatus === "taken"     ? "#ef4444" :
                    usernameStatus === "invalid"   ? "#f97316" :
                    undefined,
                }}
                value={newUsername}
                onChange={e => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                placeholder="your-handle"
                maxLength={20}
              />
              <button 
                onClick={handleSave} 
                disabled={saving}
                className={saved ? "btn-green" : "btn-purple"}
                style={{ padding: "0 16px", height: 42, fontSize: "0.85rem", whiteSpace: "nowrap" }}
              >
                {saving ? "..." : saved ? "✅ Saved" : "Confirm Changes"}
              </button>
              {usernameStatus === "checking"  && <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>⏳ checking…</span>}
              {usernameStatus === "available" && <span style={{ fontSize: "0.78rem", color: "var(--green)", fontWeight: 700 }}>✅ available</span>}
              {usernameStatus === "taken"     && <span style={{ fontSize: "0.78rem", color: "#ef4444",       fontWeight: 700 }}>❌ taken</span>}
              {usernameStatus === "invalid"   && <span style={{ fontSize: "0.78rem", color: "#f97316",       fontWeight: 700 }}>⚠️ 3-20 chars, a-z 0-9 _</span>}
            </div>
            {newUsername && userProfile?.username && newUsername !== userProfile.username &&
              usernameStatus === "available" && (
              <p style={{ color: "var(--green)", fontSize: "0.75rem", marginTop: 4 }}>
                💡 URL will change to askexpert.live/{newUsername} after saving.
              </p>
            )}
            {newUsername && (
              <a href={`/${newUsername}`} target="_blank" rel="noopener noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  marginTop: 8, padding: "8px 18px",
                  background: "linear-gradient(135deg, #7c3aed, #9333ea)",
                  color: "#fff", fontWeight: 700, fontSize: "0.85rem",
                  borderRadius: 99, textDecoration: "none",
                  boxShadow: "0 4px 14px rgba(124,58,237,0.35)",
                  transition: "transform 0.18s, box-shadow 0.18s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 20px rgba(124,58,237,0.4)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 14px rgba(124,58,237,0.35)"; }}
              >
                🔗 Open Profile
              </a>
            )}
          </div>
        </div>
      </div>

      {/* SOCIAL LINKS */}
      <div className="card-brutal">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 className="font-display" style={{ fontSize: "1.4rem", color: "var(--orange)", margin: 0 }}>
            Social Links
          </h2>
          <button
            onClick={() => setSocialLinks(prev => [...prev, { label: "", url: "" }])}
            style={{
              background: "#7c3aed", color: "#fff", border: "1.5px solid #7c3aed",
              borderRadius: 99, padding: "6px 16px", fontWeight: 700, fontSize: "0.85rem",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              boxShadow: "0 2px 10px rgba(124,58,237,0.25)",
            }}
          >
            + Add Link
          </button>
        </div>

        {socialLinks.length === 0 && (
          <p style={{ color: "var(--muted)", fontSize: "0.88rem", padding: "14px 0" }}>
            No links yet. Click "+ Add Link" to add Twitter, Instagram, your website, or anything else.
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {socialLinks.map((link, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                className="input-brutal"
                style={{ width: 130, flexShrink: 0 }}
                placeholder="Label (e.g. Twitter)"
                value={link.label}
                onChange={e => setSocialLinks(prev => prev.map((l, idx) => idx === i ? { ...l, label: e.target.value } : l))}
              />
              <input
                className="input-brutal"
                style={{ flex: 1 }}
                placeholder="https://..."
                value={link.url}
                onChange={e => setSocialLinks(prev => prev.map((l, idx) => idx === i ? { ...l, url: e.target.value } : l))}
              />
              <button
                onClick={() => setSocialLinks(prev => prev.filter((_, idx) => idx !== i))}
                style={{
                  background: "none", border: "2px solid #ccc", borderRadius: 6,
                  width: 34, height: 34, cursor: "pointer", fontWeight: 700,
                  fontSize: "1rem", color: "#888", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <p style={{ color: "var(--muted)", fontSize: "0.75rem", marginTop: 12 }}>
          Add any link — X/Twitter, Instagram, YouTube, your portfolio, etc. Shown as buttons on your public profile.
        </p>
      </div>

      {/* EXPERTISE CATEGORIES */}
      <div className="card-brutal">
        <h2 className="font-display" style={{ fontSize: "1.4rem", color: "var(--orange)", marginBottom: 8 }}>
          Expertise Categories
        </h2>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: 16 }}>Tag your areas — shown on your public profile</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {ALL_CATEGORIES.map(c => (
            <button key={c} onClick={() => toggleCategory(c)} style={chipStyle(categories.includes(c), "orange")}>
              {c}
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
