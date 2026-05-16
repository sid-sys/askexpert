"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { StreamChat, Channel as StreamChannel, MessageResponse, Event } from "stream-chat";
import { useAuth } from "@/context/AuthContext";

// CommunityChat — Instagram-Broadcast-style feed for a creator's community.
//
// Streams the channel via the core Stream SDK and renders our own UI
// (instead of stream-chat-react's components) so the look matches the
// rest of AskExpert and the broadcast pattern: creator posts, fans react.
//
// Authorisation: /api/stream/ensure-channel verifies the caller has an
// active subscription before adding them to the channel; once watching,
// channel.state.messages stays in sync via WebSocket events.
//
// What's rendered:
//   • Dark, full-bleed background
//   • Sender label + Admin badge above each post
//   • Pill-shaped message bubbles
//   • Reaction chips below each message (❤️ 🌷 👍 😂 😍) + add-new emoji
//   • Date separators centred between posts
//   • Composer at the bottom (creator-only — fans see a "react-only" hint)

const REACTION_PALETTE = [
  { type: "heart",   emoji: "❤️" },
  { type: "tulip",   emoji: "🌷" },
  { type: "thumbsup", emoji: "👍" },
  { type: "joy",     emoji: "😂" },
  { type: "love",    emoji: "😍" },
];

const COLORS = {
  bg:        "#1a0f2e",   // deep purple-black
  bgAlt:     "#241640",   // slightly lighter for bubbles
  bgChip:    "rgba(255,255,255,0.08)",
  bgChipLive: "rgba(124,58,237,0.55)",
  border:    "rgba(255,255,255,0.08)",
  text:      "#f5f3ff",
  textMuted: "rgba(245,243,255,0.55)",
  accent:    "#a855f7",
};

type ParsedMessage = {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  createdAt: Date;
  attachments: { type: string; url: string; name?: string }[];
  reactionCounts: Record<string, number>;
  ownReactions: Set<string>;
  replyCount: number;
};

function parseMessage(m: MessageResponse, viewerUid: string): ParsedMessage {
  return {
    id: m.id,
    text: m.text || "",
    senderId: (m.user as any)?.id || "unknown",
    senderName: (m.user as any)?.name || "User",
    createdAt: new Date(m.created_at || Date.now()),
    attachments: (m.attachments || []).map((a) => ({
      type: a.type || "file",
      url:  (a.image_url || a.asset_url || a.thumb_url || "") as string,
      name: a.title || a.fallback,
    })).filter((a) => a.url),
    reactionCounts: (m.reaction_counts as any) || {},
    ownReactions: new Set(
      ((m.own_reactions || []) as any[]).map((r) => r.type as string),
    ),
    replyCount: m.reply_count || 0,
  };
}

export default function CommunityChat({ creatorId }: { creatorId: string }) {
  const { user } = useAuth();
  const [client, setClient]   = useState<StreamChat | null>(null);
  const [channel, setChannel] = useState<StreamChannel | null>(null);
  const [messages, setMessages] = useState<ParsedMessage[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [error, setError]     = useState<string | null>(null);
  const [draft, setDraft]     = useState("");
  const [sending, setSending] = useState(false);
  const [pickerForId, setPickerForId] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Refresh the local list from channel.state.messages — the source of
  // truth that Stream keeps in sync via WebSocket events.
  function refresh(ch: StreamChannel | null) {
    if (!ch || !user) return;
    const list = (ch.state.messages || []).map((m) =>
      parseMessage(m as unknown as MessageResponse, user.uid),
    );
    setMessages(list);
    // Member count comes from channel.state.members keyed by uid.
    setMemberCount(Object.keys(ch.state.members || {}).length);
  }

  useEffect(() => {
    if (!user) return;
    let active = true;
    let chatClient: StreamChat | null = null;
    let unsub: (() => void) | null = null;

    (async () => {
      try {
        const { getIdToken } = await import("firebase/auth");
        const idToken = await getIdToken(user as any);

        const tokRes = await fetch("/api/stream/token", {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!tokRes.ok) throw new Error("Could not mint Stream token");
        const { token } = await tokRes.json();

        const ensureRes = await fetch("/api/stream/ensure-channel", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ creatorId }),
        });
        if (!ensureRes.ok) {
          const data = await ensureRes.json().catch(() => ({}));
          throw new Error(data.error || "Could not join community");
        }

        if (!active) return;

        const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
        if (!apiKey) throw new Error("Missing Stream API key");
        chatClient = StreamChat.getInstance(apiKey);
        await chatClient.connectUser(
          { id: user.uid, name: user.displayName || user.email || "User" },
          token,
        );
        if (!active) {
          await chatClient.disconnectUser();
          return;
        }

        const ch = chatClient.channel("community", `community-${creatorId}`);
        await ch.watch();
        if (!active) {
          await chatClient.disconnectUser();
          return;
        }

        // Bind every relevant Stream event to a single refresh — keeps the
        // local list in lock-step with channel.state without duplicating
        // logic per event type.
        const handler = (_e: Event) => refresh(ch);
        ch.on("message.new", handler);
        ch.on("message.updated", handler);
        ch.on("message.deleted", handler);
        ch.on("reaction.new", handler);
        ch.on("reaction.deleted", handler);
        ch.on("member.added", handler);
        ch.on("member.removed", handler);

        unsub = () => {
          ch.off("message.new", handler);
          ch.off("message.updated", handler);
          ch.off("message.deleted", handler);
          ch.off("reaction.new", handler);
          ch.off("reaction.deleted", handler);
          ch.off("member.added", handler);
          ch.off("member.removed", handler);
        };

        setClient(chatClient);
        setChannel(ch);
        refresh(ch);
      } catch (e: any) {
        if (active) setError(e?.message || "Failed to load community");
      }
    })();

    return () => {
      active = false;
      unsub?.();
      chatClient?.disconnectUser().catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, creatorId]);

  // Auto-scroll to bottom when new messages arrive.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Only the creator (channel owner) can post in the broadcast pattern.
  // Stream channel.state.created_by holds the creator's uid; fall back to
  // string-comparing the channel id which embeds the creatorId.
  const isCreator = useMemo(() => {
    if (!user || !channel) return false;
    const ownerId = (channel.state as any)?.channel?.created_by?.id || creatorId;
    return user.uid === ownerId;
  }, [user, channel, creatorId]);

  async function send() {
    if (!channel || !draft.trim() || sending) return;
    setSending(true);
    try {
      await channel.sendMessage({ text: draft.trim() });
      setDraft("");
    } catch (e: any) {
      setError(e?.message || "Couldn't send");
    } finally {
      setSending(false);
    }
  }

  async function toggleReaction(messageId: string, type: string, hasIt: boolean) {
    if (!channel) return;
    try {
      if (hasIt) {
        await channel.deleteReaction(messageId, type);
      } else {
        await channel.sendReaction(messageId, { type });
      }
      setPickerForId(null);
    } catch (e) {
      // ignore — UI will reconcile from server events
    }
  }

  if (!user) {
    return (
      <div style={{ padding: 60, textAlign: "center", color: COLORS.textMuted, background: COLORS.bg, minHeight: 400 }}>
        Sign in to view this community.
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: 60, textAlign: "center", background: COLORS.bg, minHeight: 400 }}>
        <div style={{ fontSize: "2rem", marginBottom: 8 }}>⚠️</div>
        <p style={{ color: "#fca5a5", fontWeight: 700 }}>{error}</p>
      </div>
    );
  }
  if (!client || !channel) {
    return (
      <div style={{ padding: 60, textAlign: "center", color: COLORS.textMuted, background: COLORS.bg, minHeight: 400, fontFamily: "'Outfit',sans-serif" }}>
        Loading community…
      </div>
    );
  }

  return (
    <div style={{
      background: COLORS.bg,
      color: COLORS.text,
      borderRadius: 18,
      overflow: "hidden",
      display: "flex", flexDirection: "column",
      minHeight: 600,
      height: "calc(100vh - 160px)",
      maxHeight: 900,
      fontFamily: "'Outfit', sans-serif",
    }}>
      {/* Header strip with member count */}
      <div style={{
        padding: "14px 18px",
        borderBottom: `1px solid ${COLORS.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: `linear-gradient(180deg, rgba(255,255,255,0.04), transparent)`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: "0.85rem", fontWeight: 700, color: COLORS.text }}>
            🌐 Community
          </div>
          <span style={{ color: COLORS.textMuted, fontSize: "0.78rem" }}>·</span>
          <span style={{ color: COLORS.textMuted, fontSize: "0.78rem", fontWeight: 600 }}>
            {memberCount.toLocaleString()} {memberCount === 1 ? "member" : "members"}
          </span>
        </div>
        <button
          type="button"
          aria-label="Notifications"
          title="Notifications"
          style={{
            width: 32, height: 32, borderRadius: "50%",
            border: "none", background: "transparent", color: COLORS.text,
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </button>
      </div>

      {/* Messages list */}
      <div
        ref={scrollerRef}
        style={{
          flex: 1, minHeight: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          padding: "16px 14px 8px",
          display: "flex", flexDirection: "column", gap: 14,
        }}
      >
        {messages.length === 0 ? (
          <div style={{ margin: "auto", textAlign: "center", color: COLORS.textMuted, fontSize: "0.92rem", padding: 24 }}>
            No posts yet.
            {isCreator
              ? " Share your first update below."
              : " Check back soon for updates from the creator."}
          </div>
        ) : messages.map((m, idx) => {
          const prev = messages[idx - 1];
          const showDateSep = !prev
            || (m.createdAt.toDateString() !== prev.createdAt.toDateString())
            || (m.createdAt.getTime() - prev.createdAt.getTime() > 3 * 3600 * 1000);
          const dateLabel = m.createdAt
            .toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
            .replace(",", " · ")
            .toUpperCase();
          const isOwner = m.senderId === creatorId;
          return (
            <Fragment key={m.id}>
              {showDateSep && (
                <div style={{
                  textAlign: "center",
                  color: COLORS.textMuted,
                  fontSize: "0.72rem", fontWeight: 600,
                  letterSpacing: "0.06em",
                  padding: "10px 0 2px",
                }}>
                  {dateLabel}
                </div>
              )}
              {isOwner && (
                <div style={{ marginLeft: 50, fontSize: "0.78rem", color: COLORS.textMuted, fontWeight: 600 }}>
                  {m.senderName} <span style={{ color: COLORS.accent, fontWeight: 700 }}>· Admin</span>
                </div>
              )}
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                {/* Avatar */}
                <div style={{
                  width: 38, height: 38, borderRadius: "50%",
                  background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff",
                  display: "grid", placeItems: "center",
                  fontWeight: 800, fontSize: "0.82rem", flexShrink: 0,
                }}>
                  {(m.senderName || "?")[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Bubble */}
                  <div style={{
                    display: "inline-block", maxWidth: "100%",
                    background: COLORS.bgAlt,
                    borderRadius: 18,
                    padding: m.attachments.length > 0 ? 6 : "10px 14px",
                    color: COLORS.text,
                    fontSize: "0.95rem", lineHeight: 1.45,
                  }}>
                    {m.attachments.map((a, i) => (
                      <AttachmentTile key={i} att={a} />
                    ))}
                    {m.text && (
                      <div style={{ padding: m.attachments.length > 0 ? "8px 10px 4px" : 0 }}>
                        {m.text}
                      </div>
                    )}
                  </div>

                  {/* Reactions row */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {m.replyCount > 0 && (
                      <ReactionChip label={`↩ ${m.replyCount}`} />
                    )}
                    {REACTION_PALETTE
                      .map((r) => ({ ...r, count: m.reactionCounts[r.type] || 0 }))
                      .filter((r) => r.count > 0 || m.ownReactions.has(r.type))
                      .map((r) => (
                        <ReactionChip
                          key={r.type}
                          label={`${r.emoji} ${r.count || 0}`}
                          active={m.ownReactions.has(r.type)}
                          onClick={() => toggleReaction(m.id, r.type, m.ownReactions.has(r.type))}
                        />
                      ))}
                    {/* Add-reaction button */}
                    <button
                      type="button"
                      onClick={() => setPickerForId(pickerForId === m.id ? null : m.id)}
                      style={{
                        background: COLORS.bgChip,
                        border: "none",
                        borderRadius: 99,
                        padding: "4px 10px",
                        cursor: "pointer",
                        color: COLORS.text,
                        fontSize: "0.85rem",
                        lineHeight: 1,
                      }}
                      aria-label="Add reaction"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "-3px" }}>
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                        <line x1="9" y1="9" x2="9.01" y2="9"/>
                        <line x1="15" y1="9" x2="15.01" y2="9"/>
                      </svg>
                    </button>
                  </div>

                  {/* Emoji picker — inline expansion */}
                  {pickerForId === m.id && (
                    <div style={{
                      marginTop: 8,
                      background: COLORS.bgChip,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 14,
                      padding: "6px 8px",
                      display: "flex", gap: 4,
                      width: "fit-content",
                    }}>
                      {REACTION_PALETTE.map((r) => (
                        <button
                          key={r.type}
                          type="button"
                          onClick={() => toggleReaction(m.id, r.type, m.ownReactions.has(r.type))}
                          style={{
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            fontSize: "1.2rem",
                            padding: "4px 6px",
                            borderRadius: 8,
                          }}
                          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)")}
                          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                        >
                          {r.emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>

      {/* Composer / fan footer */}
      <div style={{
        borderTop: `1px solid ${COLORS.border}`,
        padding: "12px 14px",
        paddingBottom: `calc(12px + env(safe-area-inset-bottom))`,
        background: "rgba(0,0,0,0.2)",
      }}>
        {isCreator ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Share an update with your community..."
              disabled={sending}
              style={{
                flex: 1, minWidth: 0, height: 42,
                borderRadius: 999,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.bgChip,
                padding: "0 18px",
                color: COLORS.text,
                fontSize: "0.92rem",
                outline: "none",
                fontFamily: "inherit",
              }}
            />
            <button
              type="button"
              onClick={send}
              disabled={!draft.trim() || sending}
              aria-label="Send"
              style={{
                width: 42, height: 42, borderRadius: "50%",
                border: "none",
                background: draft.trim() && !sending
                  ? "linear-gradient(135deg,#7c3aed,#a855f7)"
                  : COLORS.bgChip,
                color: "#fff", cursor: draft.trim() && !sending ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        ) : (
          <p style={{ margin: 0, textAlign: "center", color: COLORS.textMuted, fontSize: "0.85rem" }}>
            👋 Only the creator can post. React to their updates above.
          </p>
        )}
      </div>
    </div>
  );
}

function ReactionChip({ label, active, onClick }: { label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={{
        background: active ? COLORS.bgChipLive : COLORS.bgChip,
        border: "none",
        borderRadius: 99,
        padding: "4px 12px",
        cursor: onClick ? "pointer" : "default",
        color: COLORS.text,
        fontSize: "0.82rem",
        fontWeight: 600,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function AttachmentTile({ att }: { att: { type: string; url: string; name?: string } }) {
  if (att.type === "image") {
    return (
      <a href={att.url} target="_blank" rel="noopener noreferrer" style={{ display: "block" }}>
        <img src={att.url} alt={att.name || "image"} style={{ maxWidth: "100%", maxHeight: 360, borderRadius: 14, display: "block" }} />
      </a>
    );
  }
  if (att.type === "video") {
    return (
      <a href={att.url} target="_blank" rel="noopener noreferrer" style={{
        position: "relative", display: "block",
        background: "#000", borderRadius: 14, overflow: "hidden",
      }}>
        <video src={att.url} style={{ maxWidth: "100%", maxHeight: 360, display: "block" }} preload="metadata" />
        <div style={{
          position: "absolute", inset: 0,
          display: "grid", placeItems: "center",
          pointerEvents: "none",
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: "rgba(0,0,0,0.6)", color: "#fff",
            display: "grid", placeItems: "center",
            fontSize: "1.4rem",
          }}>▶</div>
        </div>
      </a>
    );
  }
  return (
    <a href={att.url} target="_blank" rel="noopener noreferrer" style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      background: "rgba(255,255,255,0.08)", color: "#fff",
      borderRadius: 12, padding: "8px 12px",
      textDecoration: "none", fontSize: "0.85rem",
    }}>
      📎 {att.name || "Attachment"}
    </a>
  );
}
