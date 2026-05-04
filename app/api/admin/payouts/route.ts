import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth, FieldValue } from "@/lib/firebase-admin";
import { sendPayoutEmail, sendPayoutCancelledEmail } from "@/lib/resend";

// GET  /api/admin/payouts?status=pending  — list payouts
// POST /api/admin/payouts                 — mark payout as paid / cancelled

async function verifyAdmin(req: NextRequest): Promise<string | null> {
  try {
    const token   = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return null;
    const decoded = await adminAuth.verifyIdToken(token);
    const snap    = await adminDb.collection("users").doc(decoded.uid).get();
    return snap.data()?.isAdmin ? decoded.uid : null;
  } catch (err) {
    console.error("[verifyAdmin] error:", err);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const adminUid = await verifyAdmin(req);
  if (!adminUid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const statusFilter = req.nextUrl.searchParams.get("status") ?? "pending";

  try {
    let q = adminDb.collection("pendingPayouts") as FirebaseFirestore.Query;

    if (statusFilter !== "all") {
      q = q.where("status", "==", statusFilter);
    }

    q = q.orderBy("createdAt", "desc");

    const snapshot = await q.limit(100).get();

    const payouts = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() ?? null,
      paidAt:    doc.data().paidAt?.toDate?.()?.toISOString()    ?? null,
      cancelledAt: doc.data().cancelledAt?.toDate?.()?.toISOString() ?? null,
    }));

    return NextResponse.json({ payouts });
  } catch (err: any) {
    console.error("[GET /api/admin/payouts] error:", err);
    // If index missing, Firestore returns a URL to create it
    const msg = err?.message || "Firestore query failed";
    return NextResponse.json({ error: msg, payouts: [] }, { status: 500 });
  }
}

// ── POST: mark payout as paid / cancelled / resend email ──────────────────────
export async function POST(req: NextRequest) {
  const adminUid = await verifyAdmin(req);
  if (!adminUid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { payoutId, status, reference, reason, action } = await req.json();

  if (!payoutId) {
    return NextResponse.json({ error: "payoutId is required" }, { status: 400 });
  }

  const payoutRef  = adminDb.collection("pendingPayouts").doc(payoutId);
  const payoutSnap = await payoutRef.get();
  if (!payoutSnap.exists) {
    return NextResponse.json({ error: "Payout not found" }, { status: 404 });
  }

  const payoutData = payoutSnap.data()!;

  // ── HANDLE RESEND ACTION ───────────────────────────────────────────────────
  if (action === "resend") {
    if (payoutData.status === "paid") {
      await sendPayoutEmail({
        to: payoutData.creatorEmail,
        amount: payoutData.amount,
        method: payoutData.paymentMethod || "Bank Transfer",
        reference: payoutData.reference || "N/A",
      });
      return NextResponse.json({ success: true, message: "Success email resent" });
    } else if (payoutData.status === "cancelled") {
      await sendPayoutCancelledEmail({
        to: payoutData.creatorEmail,
        amount: payoutData.amount,
        reason: payoutData.adminNotes || "No specific reason provided.",
      });
      return NextResponse.json({ success: true, message: "Cancellation email resent" });
    } else {
      return NextResponse.json({ error: "Cannot resend email for pending payouts" }, { status: 400 });
    }
  }

  // ── HANDLE STATUS UPDATE ───────────────────────────────────────────────────
  if (!["paid", "cancelled"].includes(status)) {
    return NextResponse.json({ error: "status (paid|cancelled) required" }, { status: 400 });
  }

  if (payoutData.status === status) {
    return NextResponse.json({ error: `Payout is already marked as ${status}` }, { status: 400 });
  }

  // Update the payout record
  await payoutRef.update({
    status,
    paidAt:      status === "paid"      ? FieldValue.serverTimestamp() : null,
    cancelledAt: status === "cancelled" ? FieldValue.serverTimestamp() : null,
    reference:   reference ?? payoutData.reference ?? "",
    adminNotes:  reason    ?? "",
    updatedAt:   FieldValue.serverTimestamp(),
  });

  // 1. If marking as paid: reduce creator's pendingPayoutBalance
  if (status === "paid") {
    await adminDb.collection("users").doc(payoutData.creatorId).set(
      { 
        pendingPayoutBalance: FieldValue.increment(-payoutData.amount),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    // Send success email
    await sendPayoutEmail({
      to: payoutData.creatorEmail,
      amount: payoutData.amount,
      method: payoutData.paymentMethod || "Bank Transfer",
      reference: reference || "N/A",
    }).catch(e => console.error("Email failed:", e));

  } 
  
  // 2. If marking as cancelled: notify them why it was rejected.
  if (status === "cancelled") {
     await sendPayoutCancelledEmail({
       to: payoutData.creatorEmail,
       amount: payoutData.amount,
       reason: reason
     }).catch(e => console.error("Email failed:", e));
  }

  console.log(`📤 Payout ${payoutId} marked as ${status} by admin ${adminUid}`);
  return NextResponse.json({ success: true, payoutId, status });
}
