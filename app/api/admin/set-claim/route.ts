import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb, FieldValue } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  try {
    const { uid } = await req.json();
    if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

    // Set custom claim: { admin: true }
    await adminAuth.setCustomUserClaims(uid, { admin: true });

    // Also persist in Firestore so the client can read it
    await adminDb.collection("users").doc(uid).update({ 
      isAdmin: true,
      updatedAt: FieldValue.serverTimestamp()
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[set-claim]", err);
    return NextResponse.json({ error: "Failed to set claim" }, { status: 500 });
  }
}
