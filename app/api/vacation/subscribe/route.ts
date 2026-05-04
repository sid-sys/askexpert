import { NextResponse } from "next/server";
import { adminDb, FieldValue } from "@/lib/firebase-admin";
import { COLLECTIONS } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const { creatorId, userEmail } = await req.json();

    if (!creatorId || !userEmail) {
      return NextResponse.json({ error: "Missing creatorId or userEmail" }, { status: 400 });
    }

    // Check if subscription already exists to avoid duplicates
    const subsRef = adminDb.collection(COLLECTIONS.VACATION_SUBSCRIPTIONS);
    const existing = await subsRef
      .where("creatorId", "==", creatorId)
      .where("userEmail", "==", userEmail)
      .where("status", "==", "pending")
      .get();

    if (!existing.empty) {
      return NextResponse.json({ message: "Already subscribed" });
    }

    await subsRef.add({
      creatorId,
      userEmail,
      createdAt: FieldValue.serverTimestamp(),
      status: "pending"
    });

    return NextResponse.json({ message: "Subscribed successfully" });
  } catch (error: any) {
    console.error("Subscription Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
