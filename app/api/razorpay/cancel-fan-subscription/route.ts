import { NextRequest, NextResponse } from "next/server";
import { razorpay } from "@/lib/razorpay";
import { adminDb, FieldValue, adminAuth } from "@/lib/firebase-admin";

// POST /api/razorpay/cancel-fan-subscription
// Lets a fan cancel one of their own Razorpay subscriptions to a creator.
// Mirrors /api/razorpay/cancel-subscription (which is for platform plans);
// kept separate because the auth check is different — here we verify the
// caller owns the subscription doc, not that they're an admin.
//
// Body: { subscriptionId: string, cancelAtCycleEnd?: boolean }
//   subscriptionId — Firestore subscriptions doc ID (NOT the razorpay sub id)
//   cancelAtCycleEnd — defaults to true (keep access until period end)
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

    let uid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { subscriptionId, cancelAtCycleEnd = true } = (await req.json()) as {
      subscriptionId: string;
      cancelAtCycleEnd?: boolean;
    };
    if (!subscriptionId) {
      return NextResponse.json({ error: "Missing subscriptionId" }, { status: 400 });
    }

    const subRef = adminDb.collection("subscriptions").doc(subscriptionId);
    const subSnap = await subRef.get();
    if (!subSnap.exists) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }
    const sub = subSnap.data()!;

    // Auth check: only the fan who owns this sub can cancel it.
    if (sub.followerId !== uid) {
      return NextResponse.json({ error: "Not your subscription" }, { status: 403 });
    }

    const razorpaySubId = sub.razorpaySubscriptionId as string | undefined;
    if (!razorpaySubId || sub.gateway !== "razorpay") {
      return NextResponse.json(
        { error: "This subscription is not a Razorpay sub. Use the Stripe portal instead." },
        { status: 400 }
      );
    }

    if (sub.status === "cancelled" || sub.status === "canceled") {
      return NextResponse.json({ error: "Already cancelled" }, { status: 400 });
    }

    await razorpay.subscriptions.cancel(razorpaySubId, cancelAtCycleEnd);

    // Optimistic Firestore write so the UI flips immediately. The webhook
    // (subscription.cancelled) will land later and reconcile.
    if (cancelAtCycleEnd) {
      await subRef.update({
        cancelAtPeriodEnd: true,
        updatedAt:         FieldValue.serverTimestamp(),
      });
    } else {
      await subRef.update({
        status:      "cancelled",
        cancelledAt: FieldValue.serverTimestamp(),
        updatedAt:   FieldValue.serverTimestamp(),
      });
    }

    return NextResponse.json({ ok: true, cancelAtCycleEnd });
  } catch (err: any) {
    console.error("[razorpay/cancel-fan-subscription] error:", err);
    return NextResponse.json(
      { error: err.error?.description || err.message || "Cancel failed" },
      { status: 500 }
    );
  }
}
