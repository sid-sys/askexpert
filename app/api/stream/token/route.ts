import { NextRequest, NextResponse } from "next/server";
import { streamServer } from "@/lib/stream";
import { adminAuth } from "@/lib/firebase-admin";

// POST /api/stream/token
// Mints a short-lived Stream user token for the authenticated Firebase user.
// The frontend Stream React SDK uses this token to connect — never expose
// STREAM_API_SECRET directly.
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") || "";
    const idToken = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!idToken) {
      return NextResponse.json({ error: "Missing token" }, { status: 401 });
    }

    let uid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const client = streamServer();
    // Default token lifetime is fine (24h). Re-fetch from /api/stream/token
    // whenever it expires.
    const token = client.createToken(uid);
    return NextResponse.json({ token, uid });
  } catch (err: any) {
    console.error("[stream/token] error:", err);
    return NextResponse.json({ error: err.message || "Token mint failed" }, { status: 500 });
  }
}
