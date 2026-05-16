"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import CommunityChat from "@/components/CommunityChat";

// /community/[creatorId]
// Shared community room for one creator. Members (paid subscribers) can
// read posts, react to them, and vote on polls. The creator can post
// messages, create polls, and pin announcements.
//
// Authorisation happens inside the embedded Stream channel — the
// /api/stream/ensure-channel endpoint blocks any caller who doesn't have
// an active subscription unless they're the creator themselves.
export default function CommunityPage() {
  const params = useParams<{ creatorId: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [creatorMeta, setCreatorMeta] = useState<{ displayName?: string; username?: string } | null>(null);

  useEffect(() => {
    if (!params?.creatorId) return;
    (async () => {
      const snap = await getDoc(doc(db, COLLECTIONS.USERS, params.creatorId));
      if (snap.exists()) {
        const d = snap.data();
        setCreatorMeta({ displayName: d.displayName, username: d.username });
      }
    })();
  }, [params?.creatorId]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/auth?redirect=${encodeURIComponent(`/community/${params?.creatorId}`)}`);
    }
  }, [authLoading, user, router, params?.creatorId]);

  if (authLoading || !user) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", color: "#9ca3af" }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0d0820", padding: "16px 12px" }}>
      <div style={{
        maxWidth: 720, margin: "0 auto 12px",
        display: "flex", alignItems: "center", gap: 12,
        color: "#f5f3ff",
      }}>
        <button
          onClick={() => router.back()}
          aria-label="Back"
          style={{
            width: 36, height: 36, borderRadius: "50%",
            border: "none", background: "rgba(255,255,255,0.08)", color: "#f5f3ff",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div style={{
          width: 38, height: 38, borderRadius: "50%",
          background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff",
          display: "grid", placeItems: "center",
          fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: "0.85rem",
          flexShrink: 0,
        }}>
          {(creatorMeta?.displayName || creatorMeta?.username || "?")[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: "0.98rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {creatorMeta?.displayName ? `${creatorMeta.displayName}'s circle ✨` : "Community"}
          </div>
          {creatorMeta?.username && (
            <a href={`/${creatorMeta.username}`} style={{ color: "rgba(245,243,255,0.6)", fontSize: "0.78rem", textDecoration: "none", fontFamily: "'Outfit',sans-serif" }}>
              @{creatorMeta.username} ✓
            </a>
          )}
        </div>
      </div>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <CommunityChat creatorId={params!.creatorId} />
      </div>
    </div>
  );
}
