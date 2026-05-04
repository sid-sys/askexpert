import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb, FieldValue } from "@/lib/firebase-admin";

// POST /api/admin/toggle-user
// Body: { uid: string, disabled: boolean }
// Requires: caller must have { admin: true } in their Firebase ID token custom claims.
export async function POST(req: NextRequest) {
  // ── Auth guard: verify the caller is an admin ────────────────────────────
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idToken = authHeader.slice(7);
  let callerUid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    if (!decoded.admin) {
      return NextResponse.json({ error: "Forbidden: admin claim required" }, { status: 403 });
    }
    callerUid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  const { uid, disabled } = (await req.json()) as { uid?: string; disabled?: boolean };
  if (!uid || typeof disabled !== "boolean") {
    return NextResponse.json({ error: "uid and disabled (boolean) are required" }, { status: 400 });
  }

  // Prevent an admin from disabling themselves
  if (uid === callerUid) {
    return NextResponse.json({ error: "You cannot disable your own account" }, { status: 400 });
  }

  // ── Update Firebase Auth ──────────────────────────────────────────────────
  await adminAuth.updateUser(uid, { disabled });

  // ── Mirror the disabled flag in Firestore user doc ────────────────────────
  // This lets the admin dashboard read the status without a separate Auth API call.
  await adminDb.collection("users").doc(uid).set({ 
    disabled,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  console.log(`Admin ${callerUid} set disabled=${disabled} on user ${uid}`);
  return NextResponse.json({ ok: true, uid, disabled });
}
