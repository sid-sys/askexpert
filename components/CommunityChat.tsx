"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { StreamChat, Channel as StreamChannel, MessageResponse, Event } from "stream-chat";
import { useAuth } from "@/context/AuthContext";

// CommunityChat — Instagram-Broadcast-style feed for a creator's community.
//
// Built on the Stream core SDK with our own JSX (no stream-chat-react UI).
// Features in this file:
//   • Pill text bubbles + reaction chips + emoji picker
//   • Image / video upload composer (creator only)
//   • Polls — creator creates, fans vote, results shown as live bars
//   • Threaded replies — fans can reply to any post, inline expansion
//   • "Seen by N" indicator under the latest message
//   • Date separators between days / 3h+ gaps
//   • Creator-only top-level posting (fans can react + reply)

const REACTION_PALETTE = [
  { type: "heart",   emoji: "❤️" },
  { type: "tulip",   emoji: "🌷" },
  { type: "thumbsup", emoji: "👍" },
  { type: "joy",     emoji: "😂" },
  { type: "love",    emoji: "😍" },
];

const COLORS = {
  bg:        "#1a0f2e",
  bgAlt:     "#241640",
  bgChip:    "rgba(255,255,255,0.08)",
  bgChipLive: "rgba(124,58,237,0.55)",
  border:    "rgba(255,255,255,0.08)",
  text:      "#f5f3ff",
  textMuted: "rgba(245,243,255,0.55)",
  accent:    "#a855f7",
};

type ParsedPoll = {
  id: string;
  name: string;
  options: { id: string; text: string }[];
  voteCountsByOption: Record<string, number>;
  ownVoteOptionId: string | null;
  totalVotes: number;
  isClosed: boolean;
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
  poll?: ParsedPoll;
  parentId?: string;
};

function parsePoll(rawPoll: any, viewerId: string): ParsedPoll | undefined {
  if (!rawPoll || !rawPoll.id) return undefined;
  const counts: Record<string, number> = (rawPoll.vote_counts_by_option as any) || {};
  let ownOptionId: string | null = null;
  const ownVotes = (rawPoll.own_votes || []) as any[];
  if (ownVotes.length > 0) ownOptionId = ownVotes[0]?.option_id || null;
  const totalVotes = Object.values(counts).reduce((a, b) => a + (b as number), 0);
  return {
    id: rawPoll.id,
    name: rawPoll.name || "",
    options: ((rawPoll.options || []) as any[]).map((o) => ({ id: o.id, text: o.text })),
    voteCountsByOption: counts,
    ownVoteOptionId: ownOptionId,
    totalVotes,
    isClosed: !!rawPoll.is_closed,
  };
}

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
    poll: parsePoll((m as any).poll, viewerUid),
    parentId: (m as any).parent_id || undefined,
  };
}

export default function CommunityChat({ creatorId }: { creatorId: string }) {
  const { user } = useAuth();
  const [client, setClient]   = useState<StreamChat | null>(null);
  const [channel, setChannel] = useState<StreamChannel | null>(null);
  const [messages, setMessages] = useState<ParsedMessage[]>([]);
  const [threads, setThreads] = useState<Record<string, ParsedMessage[]>>({});
  const [memberCount, setMemberCount] = useState(0);
  const [readBy, setReadBy] = useState<{ count: number; lastSeenAt: Date | null }>({ count: 0, lastSeenAt: null });
  const [error, setError]     = useState<string | null>(null);

  // Composer state
  const [draft, setDraft]     = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Poll composer state
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQ, setPollQ] = useState("");
  const [pollOpts, setPollOpts] = useState<string[]>(["", ""]);

  // Reaction picker + reply state
  const [pickerForId, setPickerForId] = useState<string | null>(null);
  const [replyForId, setReplyForId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null);

  const scrollerRef = useRef<HTMLDivElement>(null);

  function refresh(ch: StreamChannel | null) {
    if (!ch || !user) return;
    // Top-level messages (no parent_id) form the feed; replies live under
    // their parent and are looked up separately via channel.state.threads.
    const all = (ch.state.messages || []).map((m) =>
      parseMessage(m as unknown as MessageResponse, user.uid),
    );
    const topLevel = all.filter((m) => !m.parentId);
    setMessages(topLevel);

    // Build a thread map (parent_id → replies) from channel.state.threads,
    // which Stream maintains automatically once you load replies.
    const threadMap: Record<string, ParsedMessage[]> = {};
    const stateThreads = (ch.state as any).threads || {};
    for (const [parentId, repliesList] of Object.entries(stateThreads)) {
      threadMap[parentId] = (repliesList as any[]).map((r) =>
        parseMessage(r as MessageResponse, user.uid),
      );
    }
    setThreads(threadMap);

    setMemberCount(Object.keys(ch.state.members || {}).length);

    // "Seen by N" — count members whose last_read is at or after the
    // most recent top-level message, excluding the current user.
    const lastMsg = topLevel[topLevel.length - 1];
    if (lastMsg) {
      const reads = (ch.state.read || {}) as any;
      let count = 0;
      for (const [uid, info] of Object.entries(reads)) {
        if (uid === user.uid) continue;
        const lastRead = (info as any)?.last_read ? new Date((info as any).last_read) : null;
        if (lastRead && lastRead >= lastMsg.createdAt) count++;
      }
      setReadBy({ count, lastSeenAt: lastMsg.createdAt });
    } else {
      setReadBy({ count: 0, lastSeenAt: null });
    }
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
        if (!active) { await chatClient.disconnectUser(); return; }

        const ch = chatClient.channel("community", `community-${creatorId}`);
        await ch.watch();
        if (!active) { await chatClient.disconnectUser(); return; }

        // Mark the channel as read on load so the "Seen by" count rolls
        // forward and the current user counts as having seen the latest.
        await ch.markRead().catch(() => {});

        const handler = (_e: Event) => refresh(ch);
        ch.on("message.new", handler);
        ch.on("message.updated", handler);
        ch.on("message.deleted", handler);
        ch.on("reaction.new", handler);
        ch.on("reaction.deleted", handler);
        ch.on("member.added", handler);
        ch.on("member.removed", handler);
        ch.on("message.read", handler);
        ch.on("poll.vote_casted", handler);
        ch.on("poll.vote_changed", handler);
        ch.on("poll.vote_removed", handler);
        ch.on("poll.updated", handler);

        unsub = () => {
          ch.off("message.new", handler);
          ch.off("message.updated", handler);
          ch.off("message.deleted", handler);
          ch.off("reaction.new", handler);
          ch.off("reaction.deleted", handler);
          ch.off("member.added", handler);
          ch.off("member.removed", handler);
          ch.off("message.read", handler);
          ch.off("poll.vote_casted", handler);
          ch.off("poll.vote_changed", handler);
          ch.off("poll.vote_removed", handler);
          ch.off("poll.updated", handler);
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

  // Auto-scroll on new posts.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const isCreator = useMemo(() => {
    if (!user || !channel) return false;
    const ownerId = (channel.state as any)?.channel?.created_by?.id || creatorId;
    return user.uid === ownerId;
  }, [user, channel, creatorId]);

  // ── Send a regular text / media post ───────────────────────────────────────
  async function send() {
    if (!channel || sending) return;
    const text = draft.trim();
    if (!text && !pendingFile) return;
    setSending(true);
    try {
      const attachments: any[] = [];
      if (pendingFile) {
        const isImage = pendingFile.type.startsWith("image/");
        const isVideo = pendingFile.type.startsWith("video/");
        if (isImage) {
          const res = await channel.sendImage(pendingFile, pendingFile.name);
          attachments.push({ type: "image", image_url: res.file, fallback: pendingFile.name });
        } else if (isVideo) {
          const res = await channel.sendFile(pendingFile, pendingFile.name, pendingFile.type);
          attachments.push({ type: "video", asset_url: res.file, title: pendingFile.name, mime_type: pendingFile.type });
        } else {
          const res = await channel.sendFile(pendingFile, pendingFile.name, pendingFile.type);
          attachments.push({ type: "file", asset_url: res.file, title: pendingFile.name });
        }
      }
      await channel.sendMessage({ text, attachments });
      setDraft("");
      setPendingFile(null);
    } catch (e: any) {
      setError(e?.message || "Couldn't send");
    } finally {
      setSending(false);
    }
  }

  // ── Send a reply (any user) ────────────────────────────────────────────────
  async function sendReply(parentId: string) {
    if (!channel || !replyDraft.trim()) return;
    try {
      await channel.sendMessage({ text: replyDraft.trim(), parent_id: parentId } as any);
      setReplyDraft("");
      setReplyForId(null);
      // Open the thread so the new reply is visible.
      setExpandedThreadId(parentId);
      // Refresh thread state — Stream needs an explicit getReplies for older
      // ones, but new ones land via the message.new event automatically.
      await channel.getReplies(parentId, { limit: 50 }).catch(() => {});
      refresh(channel);
    } catch (e: any) {
      setError(e?.message || "Couldn't reply");
    }
  }

  async function expandThread(parentId: string) {
    setExpandedThreadId(expandedThreadId === parentId ? null : parentId);
    if (channel && expandedThreadId !== parentId) {
      await channel.getReplies(parentId, { limit: 50 }).catch(() => {});
      refresh(channel);
    }
  }

  async function toggleReaction(messageId: string, type: string, hasIt: boolean) {
    if (!channel) return;
    try {
      if (hasIt) await channel.deleteReaction(messageId, type);
      else       await channel.sendReaction(messageId, { type });
      setPickerForId(null);
    } catch { /* server events will reconcile */ }
  }

  // ── Poll creation + voting ─────────────────────────────────────────────────
  async function createPoll() {
    if (!client || !channel) return;
    const opts = pollOpts.map((o) => o.trim()).filter(Boolean);
    if (!pollQ.trim() || opts.length < 2) {
      setError("Poll needs a question and at least 2 options.");
      return;
    }
    setSending(true);
    try {
      const created = await client.createPoll({
        name: pollQ.trim(),
        options: opts.map((text) => ({ text })),
      } as any);
      const pollId = (created as any).poll?.id || (created as any).id;
      await channel.sendMessage({ text: "", poll_id: pollId } as any);
      setPollQ("");
      setPollOpts(["", ""]);
      setPollOpen(false);
    } catch (e: any) {
      setError(e?.message || "Couldn't create poll");
    } finally {
      setSending(false);
    }
  }

  async function castVote(messageId: string, pollId: string, optionId: string, replacing: string | null) {
    if (!client) return;
    try {
      if (replacing) {
        // Stream allows changing a vote by casting a new one — the old one
        // is replaced automatically when vote.poll.enforce_unique_vote is on.
        // For broadcasts we keep it single-vote; if a user picks a different
        // option we issue another castPollVote.
      }
      await client.castPollVote(messageId, pollId, { option_id: optionId });
    } catch (e: any) {
      setError(e?.message || "Couldn't vote");
    }
  }

  // ── File picker ────────────────────────────────────────────────────────────
  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setPendingFile(f);
    e.target.value = "";
  }

  // ── Render guards ──────────────────────────────────────────────────────────
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
        <button
          onClick={() => setError(null)}
          style={{ marginTop: 12, padding: "8px 16px", borderRadius: 99, background: COLORS.bgChip, color: COLORS.text, border: "none", cursor: "pointer", fontFamily: "inherit" }}
        >
          Dismiss
        </button>
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

  // ── Main render ────────────────────────────────────────────────────────────
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
      {/* Header */}
      <div style={{
        padding: "14px 18px",
        borderBottom: `1px solid ${COLORS.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: `linear-gradient(180deg, rgba(255,255,255,0.04), transparent)`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: "0.85rem", fontWeight: 700 }}>🌐 Community</div>
          <span style={{ color: COLORS.textMuted, fontSize: "0.78rem" }}>·</span>
          <span style={{ color: COLORS.textMuted, fontSize: "0.78rem", fontWeight: 600 }}>
            {memberCount.toLocaleString()} {memberCount === 1 ? "member" : "members"}
          </span>
        </div>
        <button
          type="button" aria-label="Notifications"
          style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "transparent", color: COLORS.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollerRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", padding: "16px 14px 8px", display: "flex", flexDirection: "column", gap: 14 }}>
        {messages.length === 0 ? (
          <div style={{ margin: "auto", textAlign: "center", color: COLORS.textMuted, fontSize: "0.92rem", padding: 24 }}>
            No posts yet.{isCreator ? " Share your first update below." : " Check back soon."}
          </div>
        ) : messages.map((m, idx) => {
          const prev = messages[idx - 1];
          const isLast = idx === messages.length - 1;
          const showDateSep = !prev || (m.createdAt.toDateString() !== prev.createdAt.toDateString()) || (m.createdAt.getTime() - prev.createdAt.getTime() > 3 * 3600 * 1000);
          const dateLabel = m.createdAt.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(",", " · ").toUpperCase();
          const isOwner = m.senderId === creatorId;
          const myThread = threads[m.id] || [];
          return (
            <Fragment key={m.id}>
              {showDateSep && (
                <div style={{ textAlign: "center", color: COLORS.textMuted, fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.06em", padding: "10px 0 2px" }}>
                  {dateLabel}
                </div>
              )}
              {isOwner && (
                <div style={{ marginLeft: 50, fontSize: "0.78rem", color: COLORS.textMuted, fontWeight: 600 }}>
                  {m.senderName} <span style={{ color: COLORS.accent, fontWeight: 700 }}>· Admin</span>
                </div>
              )}
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: "0.82rem", flexShrink: 0 }}>
                  {(m.senderName || "?")[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {m.poll ? (
                    <PollBubble
                      poll={m.poll}
                      onVote={(optId) => castVote(m.id, m.poll!.id, optId, m.poll!.ownVoteOptionId)}
                    />
                  ) : (
                    <div style={{ display: "inline-block", maxWidth: "100%", background: COLORS.bgAlt, borderRadius: 18, padding: m.attachments.length > 0 ? 6 : "10px 14px", color: COLORS.text, fontSize: "0.95rem", lineHeight: 1.45 }}>
                      {m.attachments.map((a, i) => <AttachmentTile key={i} att={a} />)}
                      {m.text && (
                        <div style={{ padding: m.attachments.length > 0 ? "8px 10px 4px" : 0 }}>{m.text}</div>
                      )}
                    </div>
                  )}

                  {/* Reactions */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
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
                    <button
                      type="button"
                      onClick={() => setPickerForId(pickerForId === m.id ? null : m.id)}
                      style={{ background: COLORS.bgChip, border: "none", borderRadius: 99, padding: "4px 10px", cursor: "pointer", color: COLORS.text, fontSize: "0.85rem", lineHeight: 1 }}
                      aria-label="Add reaction"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "-3px" }}>
                        <circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
                      </svg>
                    </button>
                    {/* Reply trigger */}
                    <button
                      type="button"
                      onClick={() => setReplyForId(replyForId === m.id ? null : m.id)}
                      style={{ background: COLORS.bgChip, border: "none", borderRadius: 99, padding: "4px 10px", cursor: "pointer", color: COLORS.text, fontSize: "0.82rem", fontWeight: 600 }}
                    >
                      ↩ Reply
                    </button>
                    {/* Thread expansion toggle */}
                    {(m.replyCount > 0 || myThread.length > 0) && (
                      <button
                        type="button"
                        onClick={() => expandThread(m.id)}
                        style={{ background: COLORS.bgChip, border: "none", borderRadius: 99, padding: "4px 10px", cursor: "pointer", color: COLORS.text, fontSize: "0.82rem", fontWeight: 600 }}
                      >
                        💬 {Math.max(m.replyCount, myThread.length)} {expandedThreadId === m.id ? "▴" : "▾"}
                      </button>
                    )}
                  </div>

                  {pickerForId === m.id && (
                    <div style={{ marginTop: 8, background: COLORS.bgChip, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: "6px 8px", display: "flex", gap: 4, width: "fit-content" }}>
                      {REACTION_PALETTE.map((r) => (
                        <button key={r.type} type="button" onClick={() => toggleReaction(m.id, r.type, m.ownReactions.has(r.type))} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "1.2rem", padding: "4px 6px", borderRadius: 8 }}>
                          {r.emoji}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Inline reply composer */}
                  {replyForId === m.id && (
                    <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        value={replyDraft}
                        onChange={(e) => setReplyDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendReply(m.id); } }}
                        autoFocus
                        placeholder={`Reply to ${m.senderName}…`}
                        style={{ flex: 1, height: 36, borderRadius: 99, border: `1px solid ${COLORS.border}`, background: COLORS.bgChip, padding: "0 14px", color: COLORS.text, fontSize: "0.88rem", fontFamily: "inherit", outline: "none" }}
                      />
                      <button
                        type="button"
                        onClick={() => sendReply(m.id)}
                        disabled={!replyDraft.trim()}
                        style={{ height: 36, padding: "0 14px", borderRadius: 99, border: "none", background: replyDraft.trim() ? "linear-gradient(135deg,#7c3aed,#a855f7)" : COLORS.bgChip, color: "#fff", fontWeight: 700, fontSize: "0.82rem", cursor: replyDraft.trim() ? "pointer" : "not-allowed" }}
                      >
                        Send
                      </button>
                    </div>
                  )}

                  {/* Thread (expanded) */}
                  {expandedThreadId === m.id && myThread.length > 0 && (
                    <div style={{ marginTop: 10, borderLeft: `2px solid ${COLORS.border}`, paddingLeft: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                      {myThread.map((r) => (
                        <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: "0.66rem", flexShrink: 0 }}>
                            {(r.senderName || "?")[0].toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "0.72rem", color: COLORS.textMuted, fontWeight: 600, marginBottom: 2 }}>
                              {r.senderName}
                              {r.senderId === creatorId && <span style={{ color: COLORS.accent, marginLeft: 4 }}>· Admin</span>}
                            </div>
                            <div style={{ display: "inline-block", maxWidth: "100%", background: COLORS.bgChip, borderRadius: 14, padding: "6px 12px", color: COLORS.text, fontSize: "0.88rem", lineHeight: 1.4 }}>
                              {r.text}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* "Seen by N" — only on the last top-level message */}
                  {isLast && readBy.count > 0 && (
                    <div style={{ marginTop: 8, fontSize: "0.72rem", color: COLORS.textMuted, fontWeight: 600 }}>
                      Seen by {readBy.count.toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>

      {/* Composer */}
      <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: "12px 14px", paddingBottom: `calc(12px + env(safe-area-inset-bottom))`, background: "rgba(0,0,0,0.2)" }}>
        {isCreator ? (
          <>
            {/* Pending file preview */}
            {pendingFile && (
              <div style={{ marginBottom: 8, padding: "6px 12px", background: COLORS.bgChip, borderRadius: 12, display: "flex", alignItems: "center", gap: 8, fontSize: "0.82rem" }}>
                {pendingFile.type.startsWith("image/") ? "🖼️"
                  : pendingFile.type.startsWith("video/") ? "🎬"
                  : "📎"}
                <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pendingFile.name}</span>
                <button onClick={() => setPendingFile(null)} aria-label="Remove" style={{ background: "transparent", border: "none", color: COLORS.text, cursor: "pointer", fontWeight: 800 }}>✕</button>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input ref={fileInputRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={onFilePicked} />
              <button
                type="button" onClick={() => fileInputRef.current?.click()}
                aria-label="Attach image or video"
                title="Attach image / video"
                style={{ width: 38, height: 38, borderRadius: "50%", border: "none", background: COLORS.bgChip, color: COLORS.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                </svg>
              </button>
              <button
                type="button" onClick={() => setPollOpen(true)}
                aria-label="Create poll"
                title="Create poll"
                style={{ width: 38, height: 38, borderRadius: "50%", border: "none", background: COLORS.bgChip, color: COLORS.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                </svg>
              </button>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Share an update…"
                disabled={sending}
                style={{ flex: 1, minWidth: 0, height: 42, borderRadius: 999, border: `1px solid ${COLORS.border}`, background: COLORS.bgChip, padding: "0 18px", color: COLORS.text, fontSize: "0.92rem", outline: "none", fontFamily: "inherit" }}
              />
              <button
                type="button" onClick={send}
                disabled={(!draft.trim() && !pendingFile) || sending}
                aria-label="Send"
                style={{ width: 42, height: 42, borderRadius: "50%", border: "none", background: ((draft.trim() || pendingFile) && !sending) ? "linear-gradient(135deg,#7c3aed,#a855f7)" : COLORS.bgChip, color: "#fff", cursor: ((draft.trim() || pendingFile) && !sending) ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          </>
        ) : (
          <p style={{ margin: 0, textAlign: "center", color: COLORS.textMuted, fontSize: "0.85rem" }}>
            👋 Only the creator can post. React or reply to their updates above.
          </p>
        )}
      </div>

      {/* Poll composer modal */}
      {pollOpen && (
        <div
          onClick={() => setPollOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", zIndex: 1000, padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 440, background: COLORS.bgAlt, borderRadius: 18, padding: 22, color: COLORS.text, fontFamily: "inherit", boxShadow: "0 10px 40px rgba(0,0,0,0.4)" }}
          >
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, marginBottom: 14 }}>📊 Create a poll</h3>
            <label style={{ fontSize: "0.78rem", color: COLORS.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Question</label>
            <input
              value={pollQ}
              onChange={(e) => setPollQ(e.target.value)}
              placeholder="What should I make next?"
              autoFocus
              style={{ width: "100%", height: 42, marginTop: 6, marginBottom: 14, padding: "0 14px", borderRadius: 12, border: `1px solid ${COLORS.border}`, background: COLORS.bgChip, color: COLORS.text, fontSize: "0.95rem", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
            />
            <label style={{ fontSize: "0.78rem", color: COLORS.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Options</label>
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 8 }}>
              {pollOpts.map((opt, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    value={opt}
                    onChange={(e) => setPollOpts((prev) => prev.map((p, idx) => idx === i ? e.target.value : p))}
                    placeholder={`Option ${i + 1}`}
                    style={{ flex: 1, height: 38, padding: "0 12px", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.bgChip, color: COLORS.text, fontSize: "0.9rem", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                  />
                  {pollOpts.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setPollOpts((prev) => prev.filter((_, idx) => idx !== i))}
                      style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: "transparent", color: COLORS.textMuted, cursor: "pointer", fontSize: "1rem" }}
                    >✕</button>
                  )}
                </div>
              ))}
              {pollOpts.length < 6 && (
                <button
                  type="button"
                  onClick={() => setPollOpts((prev) => [...prev, ""])}
                  style={{ marginTop: 4, padding: "8px 12px", borderRadius: 99, border: `1px dashed ${COLORS.border}`, background: "transparent", color: COLORS.textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: "0.85rem", fontWeight: 600 }}
                >
                  + Add option
                </button>
              )}
            </div>
            <div style={{ marginTop: 18, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => { setPollOpen(false); setPollQ(""); setPollOpts(["", ""]); }}
                style={{ padding: "10px 18px", borderRadius: 99, border: "none", background: COLORS.bgChip, color: COLORS.text, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createPoll}
                disabled={sending}
                style={{ padding: "10px 18px", borderRadius: 99, border: "none", background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", cursor: sending ? "wait" : "pointer", fontFamily: "inherit", fontWeight: 800 }}
              >
                {sending ? "Creating…" : "Post poll"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReactionChip({ label, active, onClick }: { label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={{ background: active ? COLORS.bgChipLive : COLORS.bgChip, border: "none", borderRadius: 99, padding: "4px 12px", cursor: onClick ? "pointer" : "default", color: COLORS.text, fontSize: "0.82rem", fontWeight: 600, lineHeight: 1.4, whiteSpace: "nowrap" }}
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
      <a href={att.url} target="_blank" rel="noopener noreferrer" style={{ position: "relative", display: "block", background: "#000", borderRadius: 14, overflow: "hidden" }}>
        <video src={att.url} style={{ maxWidth: "100%", maxHeight: 360, display: "block" }} preload="metadata" />
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(0,0,0,0.6)", color: "#fff", display: "grid", placeItems: "center", fontSize: "1.4rem" }}>▶</div>
        </div>
      </a>
    );
  }
  return (
    <a href={att.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.08)", color: "#fff", borderRadius: 12, padding: "8px 12px", textDecoration: "none", fontSize: "0.85rem" }}>
      📎 {att.name || "Attachment"}
    </a>
  );
}

function PollBubble({ poll, onVote }: { poll: ParsedPoll; onVote: (optionId: string) => void }) {
  const hasVoted = !!poll.ownVoteOptionId;
  return (
    <div style={{ background: COLORS.bgAlt, borderRadius: 18, padding: 14, color: COLORS.text, fontSize: "0.95rem", maxWidth: 460 }}>
      <div style={{ fontWeight: 700, marginBottom: 12, lineHeight: 1.4 }}>📊 {poll.name}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {poll.options.map((opt) => {
          const count = poll.voteCountsByOption[opt.id] || 0;
          const pct = poll.totalVotes > 0 ? Math.round((count / poll.totalVotes) * 100) : 0;
          const isMine = poll.ownVoteOptionId === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => !poll.isClosed && onVote(opt.id)}
              disabled={poll.isClosed}
              style={{
                position: "relative",
                textAlign: "left",
                width: "100%",
                padding: "10px 14px",
                borderRadius: 12,
                border: `1.5px solid ${isMine ? COLORS.accent : COLORS.border}`,
                background: COLORS.bgChip,
                color: COLORS.text,
                cursor: poll.isClosed ? "default" : "pointer",
                fontFamily: "inherit",
                fontSize: "0.9rem",
                overflow: "hidden",
              }}
            >
              {/* Live fill bar — only shown after user has voted */}
              {hasVoted && (
                <div style={{
                  position: "absolute", inset: 0,
                  width: `${pct}%`,
                  background: isMine ? "rgba(168,85,247,0.35)" : "rgba(255,255,255,0.08)",
                  transition: "width 0.4s",
                  borderRadius: 12,
                  pointerEvents: "none",
                }} />
              )}
              <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: isMine ? 700 : 500 }}>{opt.text}</span>
                {hasVoted && (
                  <span style={{ fontWeight: 700, color: COLORS.textMuted, flexShrink: 0 }}>
                    {pct}% {isMine && "✓"}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 10, fontSize: "0.74rem", color: COLORS.textMuted }}>
        {poll.totalVotes.toLocaleString()} {poll.totalVotes === 1 ? "vote" : "votes"}{poll.isClosed && " · Closed"}
      </div>
    </div>
  );
}
