import { NextRequest, NextResponse } from "next/server";
import { razorpay } from "@/lib/razorpay";
import { adminDb, FieldValue, adminAuth } from "@/lib/firebase-admin";

// POST /api/razorpay/cancel-subscription
// Cancels the creator's own Razorpay platform-plan subscription. Razorpay
// has no hosted billing portal like Stripe, so this is the only path for
// Indian creators to cancel from inside the app.
//
// Body: { cancelAtCycleEnd: boolean }
//   true  → keep access until current_end (recommended)
//   false → cancel immediately, no proration / refund handled here
//
// Auth: Firebase ID token in Authorization: Bearer header.
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

    const { cancelAtCycleEnd = true } = await req.json().catch(() => ({}));

    const userSnap = await adminDb.collection("users").doc(uid).get();
    if (!userSnap.exists) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const userData = userSnap.data()!;
    const subId = userData.platformPlanRazorpaySubId as string | undefined;
    if (!subId) {
      return NextResponse.json({ error: "No Razorpay subscription on this account" }, { status: 400 });
    }

    // Razorpay SDK: cancel(subId, cancel_at_cycle_end?)
    //   - omit / false → cancel immediately
    //   - true        → cancel at the end of the current billing cycle
    await razorpay.subscriptions.cancel(subId, cancelAtCycleEnd);

    // Mirror the new state into Firestore so the UI reflects it before the
    // webhook lands. subscription.cancelled fires when the cycle actually
    // ends; until then the sub status stays "active" with cancel_at_cycle_end
    // set, and our subscription.updated handler (if you add one later) can
    // reconcile. For now, optimistic write so /upgrade can show the banner.
    if (cancelAtCycleEnd) {
      await userSnap.ref.set(
        {
          planCancelAtPeriodEnd: true,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      // Immediate cancel: free plan effective right now.
      await userSnap.ref.set(
        {
          platformPlan: "free",
          platformPlanRazorpaySubId: null,
          platformPlanGateway: null,
          planCancelAtPeriodEnd: false,
          planCurrentPeriodEnd: null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    return NextResponse.json({ ok: true, cancelAtCycleEnd });
  } catch (err: any) {
    console.error("[razorpay/cancel-subscription] error:", err);
    return NextResponse.json(
      { error: err.error?.description || err.message || "Cancel failed" },
      { status: 500 }
    );
  }
}
