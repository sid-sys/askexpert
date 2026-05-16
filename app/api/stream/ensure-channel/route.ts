import { NextRequest, NextResponse } from "next/server";
import { ensureCommunityMembership } from "@/lib/stream";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

// POST /api/stream/ensure-channel
// Body: { creatorId: string }
//
// Used by the fan-side community page to lazily provision the Stream
// channel for a creator they're already subscribed to. Also called from
// the Stripe / Razorpay webhook handlers when a new subscription is
// created — that path is the primary way fans get added.
//
// We check Firestore that the caller actually has an active subscription
// to the creator before adding them. Stream's own permission system would
// also block reads from non-members, but this is a defence-in-depth
// guarantee in case the channel type config drifts.
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") || "";
    const idToken = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Missing token" }, { status: 401 });

    let fanId: string;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken);
      fanId = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { creatorId } = await req.json();
    if (!creatorId) {
      return NextResponse.json({ error: "Missing creatorId" }, { status: 400 });
    }

    // Caller-is-self short-circuit: creators can always join their own
    // community channel even before any fan subscribes.
    const isOwnChannel = fanId === creatorId;

    if (!isOwnChannel) {
      // Verify active subscription
      const subs = await adminDb
        .collection("subscriptions")
        .where("creatorId", "==", creatorId)
        .where("followerId", "==", fanId)
        .where("status", "==", "active")
        .limit(1)
        .get();
      if (subs.empty) {
        return NextResponse.json(
          { error: "You need an active subscription to this creator to access their community." },
          { status: 403 }
        );
      }
    }

    const creatorSnap = await adminDb.collection("users").doc(creatorId).get();
    const creator = creatorSnap.data() || {};

    const channelId = await ensureCommunityMembership({
      creatorId,
      creatorName: creator.displayName || creator.username || "Creator",
      creatorImage: creator.photoURL ?? null,
      fanId,
    });

    return NextResponse.json({ ok: true, channelId });
  } catch (err: any) {
    console.error("[stream/ensure-channel] error:", err);
    return NextResponse.json({ error: err.message || "Channel ensure failed" }, { status: 500 });
  }
}
