import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth, FieldValue } from "@/lib/firebase-admin";

/**
 * POST /api/fcm/save-token
 * Body: { token: string }
 * Header: Authorization: Bearer <firebase-id-token>
 * Saves the FCM token to the user's Firestore doc
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const idToken = authHeader.split("Bearer ")[1];
    const decoded = await adminAuth.verifyIdToken(idToken);

    const { token } = await req.json();
    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    // Store token in user doc — use arrayUnion to avoid duplicates
    await adminDb.collection("users").doc(decoded.uid).set(
      {
        fcmTokens: [token], // simplified; real app uses FieldValue.arrayUnion
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("save-token error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
