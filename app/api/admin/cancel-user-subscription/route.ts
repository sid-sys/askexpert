import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { razorpay } from "@/lib/razorpay";
import { adminDb, FieldValue, adminAuth } from "@/lib/firebase-admin";

// POST /api/admin/cancel-user-subscription
// Admin-only. Cancels the target user's platform-plan subscription on
// whichever gateway holds it. Detects gateway automatically by checking
// which *SubId field is set on the user doc, so the admin doesn't need
// to know whether the creator originally paid via Stripe or Razorpay.
//
// Body: { uid: string, cancelAtCycleEnd?: boolean }   // defaults to true
//
// Auth: Firebase ID token in Authorization: Bearer header. The caller must
// have userProfile.isAdmin === true.
export async function POST(req: NextRequest) {
  try {
    // ── Auth: only admins ───────────────────────────────────────────────────
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

    let callerUid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      callerUid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const callerSnap = await adminDb.collection("users").doc(callerUid).get();
    if (!callerSnap.exists || !callerSnap.data()?.isAdmin) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const { uid, cancelAtCycleEnd = true } = (await req.json()) as {
      uid: string;
      cancelAtCycleEnd?: boolean;
    };
    if (!uid) return NextResponse.json({ error: "Missing target uid" }, { status: 400 });

    // ── Find the target's active subscription ──────────────────────────────
    const targetSnap = await adminDb.collection("users").doc(uid).get();
    if (!targetSnap.exists) {
      return NextResponse.json({ error: "Target user not found" }, { status: 404 });
    }
    const target = targetSnap.data()!;
    const razorpaySubId = target.platformPlanRazorpaySubId as string | undefined;
    const stripeSubId   = target.platformPlanStripeSubId   as string | undefined;

    if (!razorpaySubId && !stripeSubId) {
      return NextResponse.json(
        { error: "User has no active paid subscription to cancel." },
        { status: 400 }
      );
    }

    // ── Cancel on the right gateway ────────────────────────────────────────
    let gateway: "stripe" | "razorpay";
    if (razorpaySubId) {
      gateway = "razorpay";
      // Razorpay SDK: cancel(subId, cancel_at_cycle_end?)
      await razorpay.subscriptions.cancel(razorpaySubId, cancelAtCycleEnd);
    } else {
      gateway = "stripe";
      if (cancelAtCycleEnd) {
        await stripe.subscriptions.update(stripeSubId!, { cancel_at_period_end: true });
      } else {
        await stripe.subscriptions.cancel(stripeSubId!);
      }
    }

    // ── Mirror the new state into Firestore for immediate UI feedback ──────
    // The relevant webhook (subscription.cancelled / customer.subscription.
    // deleted) will reconcile the rest when it fires, but the admin clicked
    // the button just now and shouldn't wait on the round-trip.
    if (cancelAtCycleEnd) {
      await targetSnap.ref.set(
        {
          planCancelAtPeriodEnd: true,
          cancelledByAdminAt:    FieldValue.serverTimestamp(),
          cancelledByAdminUid:   callerUid,
          updatedAt:             FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      // Immediate cancel — downgrade now.
      await targetSnap.ref.set(
        {
          platformPlan:                "free",
          platformPlanStripeSubId:     null,
          platformPlanRazorpaySubId:   null,
          platformPlanGateway:         null,
          planCancelAtPeriodEnd:       false,
          planCurrentPeriodEnd:        null,
          cancelledByAdminAt:          FieldValue.serverTimestamp(),
          cancelledByAdminUid:         callerUid,
          updatedAt:                   FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    console.log(`✅ [admin] ${callerUid} cancelled ${gateway} sub for ${uid} (cycleEnd=${cancelAtCycleEnd})`);
    return NextResponse.json({ ok: true, gateway, cancelAtCycleEnd });
  } catch (err: any) {
    console.error("[admin/cancel-user-subscription] error:", err);
    return NextResponse.json(
      { error: err.error?.description || err.message || "Cancel failed" },
      { status: 500 }
    );
  }
}
