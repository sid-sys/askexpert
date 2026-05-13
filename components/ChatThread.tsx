"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, limit,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

// ── Unread tracking ───────────────────────────────────────────────────────
// Last-read timestamp lives in localStorage so we don't have to write to
// Firestore on every "I saw your message" — good enough for a single-user
// counter and avoids extra writes/permissions concerns.
function unreadKey(subscriptionId: string, viewerRole: "creator" | "fan") {
  return `chat-lastread-${subscriptionId}-${viewerRole}`;
}

export function markChatRead(subscriptionId: string, viewerRole: "creator" | "fan") {
  if (typeof window === "undefined" || !subscriptionId) return;
  try { localStorage.setItem(unreadKey(subscriptionId, viewerRole), String(Date.now())); } catch {}
}

export function useChatUnread(subscriptionId: string | null, viewerRole: "creator" | "fan") {
  return useChatPreview(subscriptionId, viewerRole).unread;
}

// Returns recent-chat metadata for the conversation list rows — unread count,
// snippet of the last message, and its timestamp. Subscribes once and updates
// in real time. Returning a single object keeps both list-style needs (preview
// row + badge) in one place without duplicating the Firestore listener.
export type ChatPreview = { unread: number; lastSnippet: string; lastAt: Date | null; lastFromMe: boolean };

export function useChatPreview(subscriptionId: string | null, viewerRole: "creator" | "fan"): ChatPreview {
  const [info, setInfo] = useState<ChatPreview>({ unread: 0, lastSnippet: "", lastAt: null, lastFromMe: false });
  useEffect(() => {
    if (!subscriptionId) { setInfo({ unread: 0, lastSnippet: "", lastAt: null, lastFromMe: false }); return; }
    const q = query(
      collection(db, "subscriptions", subscriptionId, "messages"),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    const unsub = onSnapshot(q, (snap) => {
      const lastRead = parseInt(
        (typeof window !== "undefined" && localStorage.getItem(unreadKey(subscriptionId, viewerRole))) || "0",
        10
      );
      let c = 0;
      snap.docs.forEach((d) => {
        const data = d.data() as any;
        const ts = data.createdAt?.toDate?.()?.getTime?.() ?? 0;
        if (data.senderRole && data.senderRole !== viewerRole && ts > lastRead) c++;
      });
      const firstDoc = snap.docs[0];
      if (firstDoc) {
        const d = firstDoc.data() as any;
        const m: ChatMessage = {
          id: firstDoc.id,
          senderId: d.senderId ?? "",
          senderRole: d.senderRole ?? "fan",
          text: d.text ?? "",
          attachments: Array.isArray(d.attachments) ? d.attachments : [],
          createdAt: d.createdAt?.toDate?.() ?? new Date(),
          replyTo: d.replyTo ?? null,
        };
        setInfo({
          unread: c,
          lastSnippet: messageSnippet(m),
          lastAt: m.createdAt,
          lastFromMe: m.senderRole === viewerRole,
        });
      } else {
        setInfo({ unread: c, lastSnippet: "", lastAt: null, lastFromMe: false });
      }
    }, () => setInfo({ unread: 0, lastSnippet: "", lastAt: null, lastFromMe: false }));
    return () => unsub();
  }, [subscriptionId, viewerRole]);
  return info;
}

// ── Types ─────────────────────────────────────────────────────────────────
export type ChatAttachment = {
  url: string;
  type: "image" | "audio" | "file";
  name: string;
  size: number;
  mime: string;
};

export type ChatReplyRef = {
  id: string;
  snippet: string;
  senderRole: "creator" | "fan";
};

export type ChatMessage = {
  id: string;
  senderId: string;
  senderRole: "creator" | "fan";
  text: string;
  attachments: ChatAttachment[];
  createdAt: Date;
  replyTo?: ChatReplyRef | null;
};

interface ChatThreadProps {
  subscriptionId: string;
  creatorId: string;
  followerId: string;
  // Caller's perspective: are we the creator or the fan in this thread?
  viewerRole: "creator" | "fan";
  // Heading metadata
  counterpartName: string;
  counterpartSubtitle?: string;
  counterpartInitial?: string;
  // Optional fixed height; pass false to grow with content
  height?: number | string;
  // Show the header bar above messages (default true)
  showHeader?: boolean;
  // If provided, the header gets a back arrow (used by mobile single-pane).
  onBack?: () => void;
  // Edge-to-edge mode (no outer border / rounded corners). Used in the
  // desktop chat layouts where the thread butts against the chat list.
  flush?: boolean;
}

function timeAgo(d: Date): string {
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(diff / 3_600_000);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(diff / 86_400_000);
  return `${days}d ago`;
}

function classifyMime(mime: string): ChatAttachment["type"] {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Build a short text preview for a message's reply quote (text or attachment summary).
function messageSnippet(m: ChatMessage): string {
  if (m.text) return m.text.length > 80 ? m.text.slice(0, 77) + "…" : m.text;
  const att = m.attachments[0];
  if (!att) return "(message)";
  if (att.type === "image") return `🖼 ${att.name}`;
  if (att.type === "audio") return `🎙 Voice note`;
  return `📎 ${att.name}`;
}

// Reusable long-press detector — works on touch (long hold) and desktop (right-click
// also triggers the same callback so power users get a quick path).
function useLongPress(onLongPress: () => void, ms = 450) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const clear = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };
  const start = () => {
    fired.current = false;
    clear();
    timerRef.current = setTimeout(() => { fired.current = true; onLongPress(); }, ms);
  };
  return {
    onMouseDown: start,
    onMouseUp: clear,
    onMouseLeave: clear,
    onTouchStart: start,
    onTouchEnd: clear,
    onTouchCancel: clear,
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); clear(); onLongPress(); },
    // Suppress click navigation when a long-press fired (e.g. inside an <a>)
    onClickCapture: (e: React.MouseEvent) => {
      if (fired.current) { e.preventDefault(); e.stopPropagation(); fired.current = false; }
    },
  };
}

export default function ChatThread({
  subscriptionId,
  creatorId,
  followerId,
  viewerRole,
  counterpartName,
  counterpartSubtitle,
  counterpartInitial,
  height = 480,
  showHeader = true,
  onBack,
  flush = false,
}: ChatThreadProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Staged attachments waiting to be sent. Files are kept locally with an
  // object-URL so the user can preview them; nothing hits Storage until
  // they confirm with the Send button.
  type PendingFile = { id: string; file: File; previewUrl: string };
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [pendingVoice, setPendingVoice] = useState<{ blob: Blob; url: string; secs: number } | null>(null);

  // Message being quoted in the next send (set by long-press on a bubble)
  const [replyingTo, setReplyingTo] = useState<ChatReplyRef | null>(null);

  // Recording state
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // ── Subscribe to messages in real time ─────────────────────────────────
  useEffect(() => {
    if (!subscriptionId) return;
    const q = query(
      collection(db, "subscriptions", subscriptionId, "messages"),
      orderBy("createdAt", "asc"),
      limit(500)
    );
    const unsub = onSnapshot(q, (snap) => {
      setMessages(
        snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            senderId: data.senderId ?? "",
            senderRole: data.senderRole ?? "fan",
            text: data.text ?? "",
            attachments: Array.isArray(data.attachments) ? data.attachments : [],
            createdAt: data.createdAt?.toDate?.() ?? new Date(),
            replyTo: data.replyTo ?? null,
          } as ChatMessage;
        })
      );
      // Mark everything visible as read whenever the thread is mounted —
      // any new message that arrives while the chat is open is read instantly.
      markChatRead(subscriptionId, viewerRole);
    }, (err) => {
      console.error("ChatThread onSnapshot error:", err);
      setError("Could not load chat (permissions?). Refresh to retry.");
    });
    return () => unsub();
  }, [subscriptionId]);

  // Auto-scroll to bottom — but only when the user was already at (or very
  // near) the bottom. If they've scrolled up to read older messages, we leave
  // their position alone so an incoming message doesn't yank them back.
  // Always snap to the bottom when the active conversation changes.
  const lastSubRef = useRef<string | null>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const switchedConversation = lastSubRef.current !== subscriptionId;
    lastSubRef.current = subscriptionId;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const wasNearBottom = distanceFromBottom < 120;
    if (switchedConversation || wasNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, subscriptionId]);

  // ── Upload a single file to Storage and return its download URL ─────────
  async function uploadFile(file: File): Promise<string> {
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `chat_attachments/${subscriptionId}/${Date.now()}_${safeName}`;
    const ref = storageRef(storage, path);
    await uploadBytes(ref, file);
    return getDownloadURL(ref);
  }

  // ── Send everything currently staged (text + pending files + pending voice)
  async function performSend() {
    if (!user) return;
    const text = draft.trim();
    const hasFiles = pendingFiles.length > 0;
    const hasVoice = pendingVoice !== null;
    if (!text && !hasFiles && !hasVoice) return;

    setSending(true);
    setError(null);
    try {
      const attachments: ChatAttachment[] = [];
      // Upload pending files
      for (const pf of pendingFiles) {
        const url = await uploadFile(pf.file);
        attachments.push({
          url,
          type: classifyMime(pf.file.type),
          name: pf.file.name,
          size: pf.file.size,
          mime: pf.file.type,
        });
      }
      // Upload pending voice note
      if (pendingVoice) {
        const file = new File([pendingVoice.blob], `voice-${Date.now()}.webm`, { type: "audio/webm" });
        const url = await uploadFile(file);
        attachments.push({
          url,
          type: "audio",
          name: file.name,
          size: file.size,
          mime: file.type,
        });
      }

      const payload: Record<string, any> = {
        creatorId,
        followerId,
        senderId: user.uid,
        senderRole: viewerRole,
        text,
        attachments,
        createdAt: serverTimestamp(),
      };
      if (replyingTo) payload.replyTo = replyingTo;
      await addDoc(collection(db, "subscriptions", subscriptionId, "messages"), payload);

      // Reset staging area on success
      setDraft("");
      pendingFiles.forEach((pf) => URL.revokeObjectURL(pf.previewUrl));
      setPendingFiles([]);
      if (pendingVoice) URL.revokeObjectURL(pendingVoice.url);
      setPendingVoice(null);
      setReplyingTo(null);
    } catch (err: any) {
      console.error("send failed:", err);
      setError(err?.message || "Couldn't send. Try again.");
    } finally {
      setSending(false);
    }
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const staged: PendingFile[] = files.map((f) => ({
      id: Math.random().toString(36).slice(2),
      file: f,
      previewUrl: URL.createObjectURL(f),
    }));
    setPendingFiles((prev) => [...prev, ...staged]);
    e.target.value = "";
  }

  function removePendingFile(id: string) {
    setPendingFiles((prev) => {
      const removed = prev.find((p) => p.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  function discardPendingVoice() {
    if (pendingVoice) URL.revokeObjectURL(pendingVoice.url);
    setPendingVoice(null);
  }

  // ── Voice notes ────────────────────────────────────────────────────────
  async function startRecording() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Microphone is not available in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;
      const mr = new MediaRecorder(stream);
      recordChunksRef.current = [];
      const startedAt = Date.now();
      mr.ondataavailable = (e) => { if (e.data.size > 0) recordChunksRef.current.push(e.data); };
      mr.onstop = () => {
        // Stage the recording for preview instead of auto-uploading.
        const blob = new Blob(recordChunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        const secs = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        setPendingVoice({ blob, url, secs });
      };
      mr.start();
      recorderRef.current = mr;
      setRecording(true);
      setRecordSecs(0);
      recordTimerRef.current = setInterval(() => setRecordSecs((s) => s + 1), 1000);
    } catch (err: any) {
      console.error(err);
      setError("Mic permission denied.");
    }
  }

  function stopRecording(cancel = false) {
    const mr = recorderRef.current;
    if (mr && mr.state !== "inactive") {
      if (cancel) {
        // Replace onstop so we don't stage the discarded recording
        mr.onstop = () => { /* discarded */ };
      }
      mr.stop();
    }
    if (recordStreamRef.current) {
      recordStreamRef.current.getTracks().forEach((t) => t.stop());
      recordStreamRef.current = null;
    }
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    setRecording(false);
    setRecordSecs(0);
    recorderRef.current = null;
  }

  // Cleanup on unmount: stop any active recording, revoke any staged URLs.
  useEffect(() => () => {
    stopRecording(true);
    setPendingFiles((prev) => { prev.forEach((p) => URL.revokeObjectURL(p.previewUrl)); return []; });
    setPendingVoice((prev) => { if (prev) URL.revokeObjectURL(prev.url); return null; });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const initial = (counterpartInitial || counterpartName || "?")[0]?.toUpperCase() || "?";

  const isFixedHeight = typeof height === "number";

  return (
    <div style={{
      background: "#fff",
      border: flush ? "none" : "1px solid #f0f0f0",
      borderRadius: flush ? 0 : 16,
      display: "flex", flexDirection: "column",
      height: isFixedHeight ? height : (height || "auto"),
      minHeight: flush ? 0 : 380,
      overflow: "hidden",
    }}>
      {showHeader && (
        <header style={{
          padding: "14px 18px",
          borderBottom: "1px solid #f0f0f0",
          display: "flex", alignItems: "center", gap: 12,
          background: "#fff",
          // Explicit flex-shrink lock + sticky-top so the header never moves
          // when messages scroll, even if the parent height calc is off.
          flexShrink: 0,
          position: "sticky", top: 0,
          zIndex: 2,
        }}>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to chat list"
              title="Back"
              className="chat-icon-btn chat-back-btn"
              style={{
                width: 40, height: 40, borderRadius: "50%",
                border: "none", background: "#f3f4f6", color: "#1f2937",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
                padding: 0,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#e5e7eb")}
              onMouseLeave={e => (e.currentTarget.style.background = "#f3f4f6")}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
          )}
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", display: "grid", placeItems: "center", fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: "0.88rem", flexShrink: 0 }}>
            {initial}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, color: "#1f2937", fontSize: "0.95rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {counterpartName}
            </div>
            {counterpartSubtitle && (
              <div style={{ fontFamily: "'Outfit',sans-serif", color: "#9ca3af", fontSize: "0.74rem" }}>
                {counterpartSubtitle}
              </div>
            )}
          </div>
        </header>
      )}

      <div
        ref={scrollerRef}
        // overscrollBehavior contains scroll inside this list so wheel/touch
        // gestures don't bubble up and move the page behind it. Momentum on
        // iOS is preserved with the -webkit-overflow-scrolling fallback.
        style={{
          flex: 1, minHeight: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch" as any,
          padding: "16px 18px",
          display: "flex", flexDirection: "column", gap: 10,
          background: "#fafafa",
        }}
      >
        {messages.length === 0 ? (
          <div style={{ margin: "auto", textAlign: "center", color: "#9ca3af", fontFamily: "'Outfit',sans-serif", fontSize: "0.9rem", padding: 20 }}>
            No messages yet. Say hi 👋
          </div>
        ) : messages.map((m) => (
          <MessageBubble
            key={m.id}
            m={m}
            isMine={m.senderRole === viewerRole}
            onReply={() => setReplyingTo({ id: m.id, snippet: messageSnippet(m), senderRole: m.senderRole })}
          />
        ))}
      </div>

      {error && (
        <div style={{ padding: "8px 14px", background: "#fef2f2", color: "#b91c1c", fontSize: "0.78rem", borderTop: "1px solid #fecaca" }}>
          {error}
        </div>
      )}

      {recording ? (
        <div style={{ borderTop: "1px solid #f0f0f0", padding: 10, display: "flex", gap: 10, alignItems: "center", background: "#fef2f2" }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444", animation: "qc-pulse 1s infinite" }} />
          <span style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, color: "#b91c1c", fontSize: "0.85rem" }}>
            Recording… {String(Math.floor(recordSecs / 60)).padStart(2, "0")}:{String(recordSecs % 60).padStart(2, "0")}
          </span>
          <button onClick={() => stopRecording(true)} style={{ marginLeft: "auto", background: "transparent", border: "1px solid #fca5a5", color: "#b91c1c", borderRadius: 99, padding: "6px 14px", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={() => stopRecording(false)} style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 99, padding: "7px 16px", fontWeight: 800, fontSize: "0.8rem", cursor: "pointer" }}>
            ⏹ Stop & preview
          </button>
        </div>
      ) : (
        <>
          {/* Reply chip — shown above the input when long-pressing a message */}
          {replyingTo && (
            <div style={{ borderTop: "1px solid #f0f0f0", padding: "8px 12px", background: "#f5f3ff", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 3, alignSelf: "stretch", background: "#7c3aed", borderRadius: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: "0.7rem", fontWeight: 800, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Replying to {replyingTo.senderRole === viewerRole ? "yourself" : counterpartName}
                </div>
                <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: "0.82rem", color: "#374151", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {replyingTo.snippet}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                aria-label="Cancel reply"
                title="Cancel reply"
                style={{ width: 24, height: 24, borderRadius: "50%", border: "none", background: "#1f2937", color: "#fff", cursor: "pointer", fontSize: "0.74rem", fontWeight: 800 }}
              >✕</button>
            </div>
          )}

          {/* File staging strip — shown above the input when files are queued.
              Voice preview no longer lives here; it now occupies the input row itself. */}
          {pendingFiles.length > 0 && (
            <div style={{ borderTop: replyingTo ? "none" : "1px solid #f0f0f0", padding: "10px 12px", background: "#f9fafb", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "stretch" }}>
              {pendingFiles.map((pf) => {
                const isImage = pf.file.type.startsWith("image/");
                const isAudio = pf.file.type.startsWith("audio/");
                const isVideo = pf.file.type.startsWith("video/");
                return (
                  <div key={pf.id} style={{ position: "relative", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 6, paddingRight: 32, display: "flex", alignItems: "center", gap: 8, maxWidth: 240 }}>
                    {isImage ? (
                      <img src={pf.previewUrl} alt={pf.file.name} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
                    ) : isVideo ? (
                      <video src={pf.previewUrl} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, flexShrink: 0, background: "#000" }} muted />
                    ) : isAudio ? (
                      <div style={{ display: "flex", alignItems: "center", padding: "0 6px" }}>
                        <audio src={pf.previewUrl} controls style={{ height: 30, maxWidth: 180 }} />
                      </div>
                    ) : (
                      <div style={{ width: 56, height: 56, background: "#f3f4f6", borderRadius: 8, display: "grid", placeItems: "center", fontSize: "1.4rem", flexShrink: 0 }}>📎</div>
                    )}
                    {!isAudio && (
                      <div style={{ minWidth: 0, flex: 1, paddingRight: 4 }}>
                        <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: "0.78rem", fontWeight: 700, color: "#1f2937", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pf.file.name}</div>
                        <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: "0.7rem", color: "#9ca3af" }}>{fmtBytes(pf.file.size)}</div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removePendingFile(pf.id)}
                      aria-label="Remove attachment"
                      title="Remove"
                      className="chat-pending-close"
                      style={{ position: "absolute", top: "50%", right: 6, transform: "translateY(-50%)", width: 22, height: 22, borderRadius: "50%", border: "none", background: "#1f2937", color: "#fff", cursor: "pointer", fontSize: "0.7rem", fontWeight: 800, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
                    >✕</button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="chat-input-row" style={{
            borderTop: (pendingFiles.length > 0 || replyingTo) ? "none" : "1px solid #f0f0f0",
            padding: 8, display: "flex", gap: 6, alignItems: "center",
            background: "#fff",
            flexShrink: 0, // Pin to bottom — never gets squeezed by the messages list
            minWidth: 0,
            // The safe-area inset keeps the send button above the iOS home
            // indicator when the chat is in the mobile overlay mode.
            paddingBottom: `calc(8px + env(safe-area-inset-bottom))`,
          }}>
            <input ref={fileInputRef} type="file" multiple accept="image/*,audio/*,video/*,application/pdf,application/zip,.doc,.docx,.txt,.xlsx,.csv" style={{ display: "none" }} onChange={onFilePicked} />
            <button
              type="button"
              title="Attach file or image"
              aria-label="Attach file"
              className="chat-icon-btn"
              onClick={() => fileInputRef.current?.click()}
              style={{ width: 38, height: 38, borderRadius: "50%", border: "1.5px solid #e5e7eb", background: "#fff", color: "#6b7280", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.05rem", flexShrink: 0, padding: 0 }}
            >📎</button>
            <button
              type="button"
              title="Record voice note"
              aria-label="Record voice note"
              className="chat-icon-btn"
              onClick={startRecording}
              disabled={!!pendingVoice}
              style={{ width: 38, height: 38, borderRadius: "50%", border: "1.5px solid #e5e7eb", background: "#fff", color: "#6b7280", cursor: pendingVoice ? "not-allowed" : "pointer", opacity: pendingVoice ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.05rem", flexShrink: 0, padding: 0 }}
            >🎙️</button>

            {/* Where the text input normally sits — when a voice note is staged,
                the pill becomes an inline audio preview with its own close X. */}
            {pendingVoice ? (
              <div style={{
                flex: 1, height: 40, borderRadius: 99, border: "1.5px solid #ddd6fe",
                background: "#f5f3ff", padding: "0 8px 0 14px",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{ fontSize: "0.95rem" }}>🎙️</span>
                <audio src={pendingVoice.url} controls style={{ flex: 1, height: 30, minWidth: 0 }} className="chat-audio" />
                <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: "0.72rem", color: "#7c3aed", fontWeight: 700, whiteSpace: "nowrap" }}>
                  {String(Math.floor(pendingVoice.secs / 60)).padStart(2, "0")}:{String(pendingVoice.secs % 60).padStart(2, "0")}
                </span>
                <button
                  type="button"
                  onClick={discardPendingVoice}
                  aria-label="Discard voice note"
                  title="Discard"
                  className="chat-pending-close"
                  style={{ width: 26, height: 26, borderRadius: "50%", border: "none", background: "#1f2937", color: "#fff", cursor: "pointer", fontSize: "0.74rem", fontWeight: 800, flexShrink: 0, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
                >✕</button>
              </div>
            ) : (
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); performSend(); } }}
                placeholder="Type your message…"
                disabled={sending}
                style={{ flex: 1, minWidth: 0, height: 40, borderRadius: 99, border: "1.5px solid #e5e7eb", padding: "0 14px", fontFamily: "'Outfit',sans-serif", fontSize: "0.9rem", outline: "none", boxSizing: "border-box" }}
              />
            )}

            {(() => {
              const canSend = !sending && (draft.trim().length > 0 || pendingFiles.length > 0 || pendingVoice !== null);
              return (
                <button
                  onClick={performSend}
                  disabled={!canSend}
                  aria-label="Send message"
                  className="chat-send-btn"
                  style={{ height: 40, padding: "0 14px", borderRadius: 99, border: "none", background: canSend ? "linear-gradient(135deg,#7c3aed,#a855f7)" : "#e5e7eb", color: "#fff", fontWeight: 800, fontFamily: "'Outfit',sans-serif", fontSize: "0.85rem", cursor: canSend ? "pointer" : "not-allowed", flexShrink: 0 }}
                >
                  {sending ? "…" : "Send"}
                </button>
              );
            })()}
          </div>
        </>
      )}
      <style jsx>{`
        @keyframes qc-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
      <style jsx global>{`
        /* Hide the WebKit/Chromium audio overflow ("⋮") menu inside the chat */
        audio::-webkit-media-controls-overflow-menu-button,
        audio::-webkit-media-controls-overflow-menu-list,
        audio::-internal-media-controls-overflow-button {
          display: none !important;
        }
        /* Override the universal button rule in globals.css (forces padding
           6px 14px + border-radius 8px + font-size 0.75rem on every <button>).
           Without these specific overrides the chat header back arrow and
           input-row icon buttons render as squashed pills instead of circles. */
        button.chat-icon-btn {
          padding: 0 !important;
          border-radius: 50% !important;
          font-size: 1.05rem !important;
          font-weight: 600 !important;
        }
        button.chat-back-btn {
          font-size: 0 !important;
        }
        button.chat-send-btn {
          padding: 0 14px !important;
          border-radius: 99px !important;
          font-size: 0.85rem !important;
          font-weight: 800 !important;
        }
        button.chat-pending-close {
          padding: 0 !important;
          border-radius: 50% !important;
          font-size: 0.7rem !important;
          font-weight: 800 !important;
          line-height: 1 !important;
        }
        .chat-input-row {
          box-sizing: border-box;
        }
        .chat-input-row input[type="text"],
        .chat-input-row input:not([type]) {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
}

// ── Single message bubble — split out so each row owns its own long-press
// detector (hooks can't live inside a .map() callback).
function MessageBubble({
  m, isMine, onReply,
}: {
  m: ChatMessage;
  isMine: boolean;
  onReply: () => void;
}) {
  const longPress = useLongPress(onReply);
  const reply = m.replyTo;
  return (
    <div style={{ display: "flex", justifyContent: isMine ? "flex-end" : "flex-start" }}>
      <div
        {...longPress}
        style={{
          maxWidth: "75%",
          background: isMine ? "linear-gradient(135deg,#7c3aed,#a855f7)" : "#fff",
          color: isMine ? "#fff" : "#1f2937",
          border: isMine ? "none" : "1px solid #e5e7eb",
          borderRadius: isMine ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
          padding: m.attachments.length > 0 || !m.text || reply ? "8px" : "8px 14px",
          fontSize: "0.9rem",
          lineHeight: 1.45,
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          userSelect: "none",
          WebkitUserSelect: "none",
          cursor: "pointer",
        }}
      >
        {reply && (
          <div style={{
            borderLeft: `3px solid ${isMine ? "rgba(255,255,255,0.6)" : "#a855f7"}`,
            background: isMine ? "rgba(255,255,255,0.12)" : "#f5f3ff",
            color: isMine ? "#fff" : "#374151",
            borderRadius: 8,
            padding: "6px 10px",
            marginBottom: 6,
            fontSize: "0.78rem",
            lineHeight: 1.35,
            opacity: 0.95,
          }}>
            <div style={{ fontSize: "0.66rem", fontWeight: 800, opacity: 0.85, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
              {reply.senderRole === m.senderRole ? "↳ You replied" : "↳ Reply"}
            </div>
            <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{reply.snippet}</div>
          </div>
        )}
        {m.attachments.map((att, i) => (
          <AttachmentBubble key={i} att={att} mine={isMine} />
        ))}
        {m.text && <div style={{ padding: m.attachments.length > 0 ? "6px 8px 2px" : 0 }}>{m.text}</div>}
        <div style={{ fontSize: "0.66rem", opacity: 0.7, marginTop: 4, padding: m.attachments.length > 0 ? "0 8px 4px" : 0, textAlign: isMine ? "right" : "left" }}>
          {timeAgo(m.createdAt)}
        </div>
      </div>
    </div>
  );
}

function AttachmentBubble({ att, mine }: { att: ChatAttachment; mine: boolean }) {
  if (att.type === "image") {
    return (
      <a href={att.url} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginBottom: 6 }}>
        <img src={att.url} alt={att.name} style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 10, display: "block" }} />
      </a>
    );
  }
  if (att.type === "audio") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px" }}>
        <audio controls src={att.url} style={{ height: 32 }} />
      </div>
    );
  }
  return (
    <a
      href={att.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        background: mine ? "rgba(255,255,255,0.15)" : "#f3f4f6",
        color: mine ? "#fff" : "#1f2937",
        border: mine ? "none" : "1px solid #e5e7eb",
        borderRadius: 10, padding: "6px 10px",
        textDecoration: "none", fontSize: "0.85rem", fontWeight: 600,
      }}
    >
      📎 <span style={{ maxWidth: 200, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{att.name}</span>
      <span style={{ opacity: 0.7, fontSize: "0.72rem" }}>({fmtBytes(att.size)})</span>
    </a>
  );
}
