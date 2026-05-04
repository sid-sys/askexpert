import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

async function verifyAdmin(req: NextRequest): Promise<string | null> {
  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return null;
    const decoded = await adminAuth.verifyIdToken(token);
    const snap = await adminDb.collection("users").doc(decoded.uid).get();
    return snap.data()?.isAdmin ? decoded.uid : null;
  } catch (err) {
    console.error("[verifyAdmin] error:", err);
    return null;
  }
}

// DELETE /api/admin/delete-creator-questions  { creatorId }
export async function POST(req: NextRequest) {
  const adminUid = await verifyAdmin(req);
  if (!adminUid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { creatorId } = await req.json();
  if (!creatorId) return NextResponse.json({ error: "creatorId required" }, { status: 400 });

  const snap = await adminDb
    .collection("questions")
    .where("creatorId", "==", creatorId)
    .get();

  if (snap.empty) {
    return NextResponse.json({ deleted: 0, message: "No questions found for this creator" });
  }

  // Firestore batch limit = 500 writes
  const batches: FirebaseFirestore.WriteBatch[] = [];
  let batch = adminDb.batch();
  let count = 0;

  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    count++;
    if (count % 499 === 0) {
      batches.push(batch);
      batch = adminDb.batch();
    }
  }
  if (count % 499 !== 0 || count === 0) batches.push(batch);

  await Promise.all(batches.map(b => b.commit()));

  console.log(`🗑️ Admin ${adminUid} deleted ${snap.size} questions for creator ${creatorId}`);
  return NextResponse.json({ deleted: snap.size, creatorId });
}
