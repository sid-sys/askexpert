"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection, doc, query, orderBy, onSnapshot, addDoc, setDoc, deleteDoc,
  serverTimestamp, where, limit, getDocs,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

// CommunityChat — broadcast feed for a creator, backed entirely by Firestore.
//
// Data layout:
//   communities/{creatorId}/posts/{postId}
//     { content, attachments[], createdAt, senderId, senderName }
//     reactions/{userId}
//       { emoji, createdAt }
//
// Permissions (enforced by firestore.rules):
//   • Read posts + reactions: any signed-in user (UI gates by active sub).
//   • Create / edit / delete posts: only the creator (uid === creatorId).
//   • Create / delete own reaction: any signed-in user.
//
// Behavior:
//   • Creator: media-attachable text composer + delete-own controls.
//   • Fan: react-only on each post, with a Reply button that opens the
//     1:1 chat thread for that creator with the post snippet pre-filled
//     as a reply quote.

const REACTION_PALETTE = [
  { emoji: "❤️" },
  { emoji: "🌷" },
  { emoji: "👍" },
  { emoji: "😂" },
  { emoji: "😍" },
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

type Attachment = { type: "image" | "video" | "file"; url: string; name?: string; mime?: string };
type Post = {
  id: string;
  content: string;
  attachments: Attachment[];
  createdAt: Date;
  senderId: string;
  senderName: string;
  reactionCounts: Record<string, number>;
  ownReaction: string | null;
};

export default function CommunityChat({ creatorId }: { creatorId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pickerForId, setPickerForId] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const isCreator = !!user && user.uid === creatorId;

  // Live posts feed.
  useEffect(() => {
    if (!user) return;
    const postsRef = collection(db, "communities", creatorId, "posts");
    const unsub = onSnapshot(
      query(postsRef, orderBy("createdAt", "asc"), limit(200)),
      async (snap) => {
        // Resolve reactions per post in parallel. Reactions live as a
        // subcollection; for the v1 size of these feeds (~tens of posts)
        // a per-post fetch is fine. If volume grows we can listen on
        // reactions/{userId} for own + use a denormalised count map.
        const docs = snap.docs;
        const out: Post[] = await Promise.all(
          docs.map(async (d) => {
            const data = d.data() as any;
            const reactionsRef = collection(db, "communities", creatorId, "posts", d.id, "reactions");
            let counts: Record<string, number> = {};
            let own: string | null = null;
            try {
              const rSnap = await getDocs(reactionsRef);
              rSnap.forEach((r) => {
                const e = (r.data() as any).emoji as string | undefined;
                if (!e) return;
                counts[e] = (counts[e] || 0) + 1;
                if (r.id === user.uid) own = e;
              });
            } catch {/* ignore */}
            return {
              id: d.id,
              content: data.content || "",
              attachments: (data.attachments || []) as Attachment[],
              createdAt: data.createdAt?.toDate?.() || new Date(),
              senderId: data.senderId || creatorId,
              senderName: data.senderName || "Creator",
              reactionCounts: counts,
              ownReaction: own,
            };
          }),
        );
        setPosts(out);
      },
      (err) => {
        const msg = err?.message || "";
        if (!msg.includes("client is offline")) {
          console.error("[community feed]", err);
          setError(msg || "Could not load feed");
        }
      },
    );
    return () => unsub();
  }, [user, creatorId]);

  // Live reaction subscriptions per post — when reactions change, refresh
  // just that post's counts. Lightweight because each path is a small
  // subcollection.
  useEffect(() => {
    if (!user || posts.length === 0) return;
    const unsubs = posts.map((p) => {
      const reactionsRef = collection(db, "communities", creatorId, "posts", p.id, "reactions");
      return onSnapshot(reactionsRef, (snap) => {
        let counts: Record<string, number> = {};
        let own: string | null = null;
        snap.forEach((r) => {
          const e = (r.data() as any).emoji as string | undefined;
          if (!e) return;
          counts[e] = (counts[e] || 0) + 1;
          if (r.id === user.uid) own = e;
        });
        setPosts((prev) =>
          prev.map((x) => (x.id === p.id ? { ...x, reactionCounts: counts, ownReaction: own } : x)),
        );
      });
    });
    return () => { unsubs.forEach((u) => u()); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, creatorId, posts.length]);

  // Auto-scroll on new posts.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [posts.length]);

  // ── Creator: post ──────────────────────────────────────────────────────────
  async function send() {
    if (!user || sending) return;
    const text = draft.trim();
    if (!text && !pendingFile) return;
    setSending(true);
    try {
      const attachments: Attachment[] = [];
      if (pendingFile) {
        const isImage = pendingFile.type.startsWith("image/");
        const isVideo = pendingFile.type.startsWith("video/");
        const objectRef = storageRef(
          storage,
          `community/${creatorId}/${Date.now()}_${pendingFile.name}`,
        );
        await uploadBytes(objectRef, pendingFile);
        const url = await getDownloadURL(objectRef);
        attachments.push({
          type: isImage ? "image" : isVideo ? "video" : "file",
          url,
          name: pendingFile.name,
          mime: pendingFile.type,
        });
      }
      await addDoc(collection(db, "communities", creatorId, "posts"), {
        content: text,
        attachments,
        senderId: user.uid,
        senderName: user.displayName || user.email || "Creator",
        createdAt: serverTimestamp(),
      });
      setDraft("");
      setPendingFile(null);
    } catch (e: any) {
      setError(e?.message || "Couldn't post");
    } finally {
      setSending(false);
    }
  }

  // ── Anyone: react ──────────────────────────────────────────────────────────
  async function toggleReaction(postId: string, emoji: string) {
    if (!user) return;
    const myRef = doc(db, "communities", creatorId, "posts", postId, "reactions", user.uid);
    const post = posts.find((p) => p.id === postId);
    const already = post?.ownReaction === emoji;
    try {
      if (already) {
        await deleteDoc(myRef);
      } else {
        await setDoc(myRef, { emoji, createdAt: serverTimestamp() });
      }
      setPickerForId(null);
    } catch (e: any) {
      setError(e?.message || "Couldn't react");
    }
  }

  // ── Creator: delete own post ───────────────────────────────────────────────
  async function deletePost(postId: string) {
    if (!isCreator) return;
    if (!confirm("Delete this post for everyone?")) return;
    try {
      await deleteDoc(doc(db, "communities", creatorId, "posts", postId));
    } catch (e: any) {
      setError(e?.message || "Couldn't delete");
    }
  }

  // ── Fan: tap Reply → navigate to 1:1 chat with post quoted ────────────────
  async function navigateToReply(post: Post) {
    if (!user) return;
    try {
      // Find this fan's active subscription doc for the creator. The
      // /fan-dashboard chat view keys off subscription.id.
      const subsSnap = await getDocs(query(
        collection(db, "subscriptions"),
        where("creatorId", "==", creatorId),
        where("followerId", "==", user.uid),
        where("status", "==", "active"),
        limit(1),
      ));
      if (subsSnap.empty) {
        setError("You need an active subscription to reply.");
        return;
      }
      const subId = subsSnap.docs[0].id;
      // Stash the prefill in sessionStorage — picked up by fan-dashboard
      // when it instantiates ChatThread.
      const snippet = post.content
        || (post.attachments[0]?.type === "image" ? "🖼️ Image" : post.attachments[0]?.type === "video" ? "🎬 Video" : "Attachment");
      sessionStorage.setItem("community-reply-prefill", JSON.stringify({
        subId,
        postId: post.id,
        snippet: snippet.slice(0, 200),
        senderId: post.senderId,
      }));
      router.push(`/fan-dashboard?view=questions&sub=${encodeURIComponent(subId)}`);
    } catch (e: any) {
      setError(e?.message || "Couldn't open chat");
    }
  }

  // ── File picker ────────────────────────────────────────────────────────────
  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setPendingFile(f);
    e.target.value = "";
  }

  if (!user) {
    return (
      <div style={{ padding: 60, textAlign: "center", color: COLORS.textMuted, background: COLORS.bg, minHeight: 400, borderRadius: 18 }}>
        Sign in to view this community.
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
      {error && (
        <div style={{ padding: "8px 14px", background: "rgba(239,68,68,0.15)", color: "#fca5a5", fontSize: "0.82rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: "transparent", border: "none", color: "#fca5a5", cursor: "pointer", fontWeight: 800 }}>✕</button>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollerRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", padding: "16px 14px 8px", display: "flex", flexDirection: "column", gap: 14 }}>
        {posts.length === 0 ? (
          <div style={{ margin: "auto", textAlign: "center", color: COLORS.textMuted, fontSize: "0.92rem", padding: 24 }}>
            No posts yet.{isCreator ? " Share your first update below." : " Check back soon."}
          </div>
        ) : posts.map((p, idx) => {
          const prev = posts[idx - 1];
          const showDateSep = !prev || (p.createdAt.toDateString() !== prev.createdAt.toDateString()) || (p.createdAt.getTime() - prev.createdAt.getTime() > 3 * 3600 * 1000);
          const dateLabel = p.createdAt.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(",", " · ").toUpperCase();
          return (
            <Fragment key={p.id}>
              {showDateSep && (
                <div style={{ textAlign: "center", color: COLORS.textMuted, fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.06em", padding: "10px 0 2px" }}>
                  {dateLabel}
                </div>
              )}
              <div style={{ marginLeft: 50, fontSize: "0.78rem", color: COLORS.textMuted, fontWeight: 600 }}>
                {p.senderName} <span style={{ color: COLORS.accent, fontWeight: 700 }}>· Admin</span>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: "0.82rem", flexShrink: 0 }}>
                  {(p.senderName || "?")[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "inline-block", maxWidth: "100%", background: COLORS.bgAlt, borderRadius: 18, padding: p.attachments.length > 0 ? 6 : "10px 14px", color: COLORS.text, fontSize: "0.95rem", lineHeight: 1.45 }}>
                    {p.attachments.map((a, i) => <AttachmentTile key={i} att={a} />)}
                    {p.content && (
                      <div style={{ padding: p.attachments.length > 0 ? "8px 10px 4px" : 0 }}>{p.content}</div>
                    )}
                  </div>

                  {/* Action chips */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {REACTION_PALETTE
                      .map((r) => ({ ...r, count: p.reactionCounts[r.emoji] || 0 }))
                      .filter((r) => r.count > 0 || p.ownReaction === r.emoji)
                      .map((r) => (
                        <ReactionChip
                          key={r.emoji}
                          label={`${r.emoji} ${r.count || 0}`}
                          active={p.ownReaction === r.emoji}
                          onClick={() => toggleReaction(p.id, r.emoji)}
                        />
                      ))}
                    <button
                      type="button"
                      onClick={() => setPickerForId(pickerForId === p.id ? null : p.id)}
                      style={{ background: COLORS.bgChip, border: "none", borderRadius: 99, padding: "4px 10px", cursor: "pointer", color: COLORS.text, fontSize: "0.85rem", lineHeight: 1 }}
                      aria-label="Add reaction"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "-3px" }}>
                        <circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
                      </svg>
                    </button>
                    {/* Reply — fans only (creator's own posts shouldn't surface "reply to yourself") */}
                    {!isCreator && (
                      <button
                        type="button"
                        onClick={() => navigateToReply(p)}
                        style={{ background: COLORS.bgChip, border: "none", borderRadius: 99, padding: "4px 12px", cursor: "pointer", color: COLORS.text, fontSize: "0.82rem", fontWeight: 600 }}
                      >
                        ↩ Reply
                      </button>
                    )}
                    {/* Delete — creator only */}
                    {isCreator && (
                      <button
                        type="button"
                        onClick={() => deletePost(p.id)}
                        style={{ background: "transparent", border: "none", padding: "4px 8px", cursor: "pointer", color: COLORS.textMuted, fontSize: "0.78rem" }}
                      >
                        🗑 Delete
                      </button>
                    )}
                  </div>

                  {pickerForId === p.id && (
                    <div style={{ marginTop: 8, background: COLORS.bgChip, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: "6px 8px", display: "flex", gap: 4, width: "fit-content" }}>
                      {REACTION_PALETTE.map((r) => (
                        <button key={r.emoji} type="button" onClick={() => toggleReaction(p.id, r.emoji)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "1.2rem", padding: "4px 6px", borderRadius: 8 }}>
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

      {/* Composer (creator-only) */}
      <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: "12px 14px", paddingBottom: `calc(12px + env(safe-area-inset-bottom))`, background: "rgba(0,0,0,0.2)" }}>
        {isCreator ? (
          <>
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
            👋 Only the creator can post here. React or reply to their updates above.
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
      style={{ background: active ? COLORS.bgChipLive : COLORS.bgChip, border: "none", borderRadius: 99, padding: "4px 12px", cursor: onClick ? "pointer" : "default", color: COLORS.text, fontSize: "0.82rem", fontWeight: 600, lineHeight: 1.4, whiteSpace: "nowrap" }}
    >
      {label}
    </button>
  );
}

function AttachmentTile({ att }: { att: Attachment }) {
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
