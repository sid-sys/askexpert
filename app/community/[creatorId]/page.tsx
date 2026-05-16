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
    <div style={{ minHeight: "100vh", background: "#f8f7ff" }}>
      <div style={{
        maxWidth: 960, margin: "0 auto", padding: "16px 16px 4px",
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
      }}>
        <div>
          <h1 style={{ fontFamily: "'Outfit',sans-serif", fontSize: "1.4rem", fontWeight: 800, color: "#1f2937", margin: 0 }}>
            {creatorMeta?.displayName ? `${creatorMeta.displayName}'s community` : "Community"}
          </h1>
          {creatorMeta?.username && (
            <a href={`/${creatorMeta.username}`} style={{ color: "#7c3aed", fontSize: "0.85rem", textDecoration: "none", fontWeight: 600 }}>
              @{creatorMeta.username} →
            </a>
          )}
        </div>
        <button
          onClick={() => router.back()}
          style={{
            padding: "8px 14px", borderRadius: 99, border: "1.5px solid #e5e7eb",
            background: "#fff", color: "#374151", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer",
          }}
        >
          ← Back
        </button>
      </div>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 8px 24px" }}>
        <CommunityChat creatorId={params!.creatorId} />
      </div>
    </div>
  );
}
