"use client";

interface LivePreviewProps {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  username: string;
  pushPreview: () => void;
}

export default function LivePreview({ iframeRef, username, pushPreview }: LivePreviewProps) {
  return (
    <div style={{
      width: 400, flexShrink: 0,
      position: "sticky", top: 80,
      border: "3px solid #000",
      boxShadow: "5px 5px 0 #000",
      borderRadius: 12,
      overflow: "hidden",
    }}>

      {/* Title bar */}
      <div style={{
        padding: "8px 12px",
        background: "#1a1a2e",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57", display: "inline-block", flexShrink: 0 }} />
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#febc2e", display: "inline-block", flexShrink: 0 }} />
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840", display: "inline-block", flexShrink: 0 }} />
        <span style={{ flex: 1 }} />
        <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.08em" }}>
          LIVE PREVIEW
        </span>
      </div>

      {/* Address bar */}
      <div style={{
        padding: "6px 10px",
        background: "#252540",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <button
          onClick={() => { if (iframeRef.current) iframeRef.current.src = username ? `/${username}` : "/"; }}
          title="Reload preview"
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "rgba(255,255,255,0.45)", fontSize: "1rem",
            padding: 0, lineHeight: 1, flexShrink: 0,
          }}
        >↻</button>

        <div style={{
          flex: 1,
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 6,
          padding: "5px 10px",
          display: "flex", alignItems: "center", gap: 4,
          minWidth: 0,
        }}>
          <span style={{ color: "#28c840", fontSize: "0.68rem", flexShrink: 0 }}>🔒</span>
          <span style={{ color: "rgba(255,255,255,0.38)", fontSize: "0.76rem", whiteSpace: "nowrap" }}>
            askexpert.live/
          </span>
          <span style={{
            color: "#fff", fontSize: "0.76rem", fontWeight: 700,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {username || "…"}
          </span>
        </div>

        {username && (
          <a
            href={`/${username}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Open public profile in new tab"
            style={{ color: "rgba(255,255,255,0.45)", fontSize: "1rem", textDecoration: "none", flexShrink: 0, lineHeight: 1 }}
          >⬀</a>
        )}
      </div>

      {/* Live badge strip */}
      <div style={{
        background: "#7c3aed", padding: "4px 12px",
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: "50%", background: "#4ade80",
          display: "inline-block", flexShrink: 0,
          animation: "pulse 1.5s infinite",
        }} />
        <span style={{ color: "#fff", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.04em" }}>
          Reflects after saving — public profile updates instantly
        </span>
      </div>

      <iframe
        ref={iframeRef}
        src={username ? `/${username}` : "/"}
        onLoad={pushPreview}
        style={{
          width: "100%",
          height: 620,
          border: "none",
          background: "#fff",
        }}
        title="Public Profile Preview"
      />
    </div>
  );
}
