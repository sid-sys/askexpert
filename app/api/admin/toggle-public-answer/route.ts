import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth, FieldValue } from "@/lib/firebase-admin";

async function verifyAdminOrCreator(req: NextRequest): Promise<{ uid: string; isAdmin: boolean } | null> {
  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return null;
    const decoded = await adminAuth.verifyIdToken(token);
    const snap = await adminDb.collection("users").doc(decoded.uid).get();
    const data = snap.data();
    if (!data) return null;
    return { uid: decoded.uid, isAdmin: !!data.isAdmin };
  } catch {
    return null;
  }
}

// POST /api/admin/toggle-public-answer  { questionId, isPublic: boolean }
export async function POST(req: NextRequest) {
  const caller = await verifyAdminOrCreator(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { questionId, isPublic } = await req.json();
  if (!questionId || typeof isPublic !== "boolean") {
    return NextResponse.json({ error: "questionId and isPublic (boolean) required" }, { status: 400 });
  }

  const qRef = adminDb.collection("questions").doc(questionId);
  const qSnap = await qRef.get();
  if (!qSnap.exists) return NextResponse.json({ error: "Question not found" }, { status: 404 });

  const qData = qSnap.data()!;

  // Only the creator who owns the question OR an admin can toggle this
  if (!caller.isAdmin && qData.creatorId !== caller.uid) {
    return NextResponse.json({ error: "Forbidden: you don't own this question" }, { status: 403 });
  }

  // Must be ANSWERED to be made public
  if (isPublic && qData.status !== "ANSWERED") {
    return NextResponse.json({ error: "Only answered questions can be made public" }, { status: 400 });
  }

  await qRef.update({
    isPublicAnswer: isPublic,
    updatedAt: FieldValue.serverTimestamp(),
  });

  console.log(`👁️ ${caller.uid} set question ${questionId} isPublicAnswer → ${isPublic}`);
  return NextResponse.json({ ok: true, questionId, isPublicAnswer: isPublic });
}
