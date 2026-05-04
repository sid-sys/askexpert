import { NextResponse } from "next/server";
import { adminDb, FieldValue } from "@/lib/firebase-admin";
import { COLLECTIONS } from "@/lib/types";
import { sendVacationReturnEmail } from "@/lib/resend";

export async function POST(req: Request) {
  try {
    const { creatorId } = await req.json();

    if (!creatorId) {
      return NextResponse.json({ error: "Missing creatorId" }, { status: 400 });
    }

    // 1. Get creator info
    const creatorSnap = await adminDb.collection(COLLECTIONS.USERS).doc(creatorId).get();
    if (!creatorSnap.exists) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 });
    }
    const creator = creatorSnap.data();

    // 2. Get all pending subscriptions for this creator
    const subsSnap = await adminDb.collection(COLLECTIONS.VACATION_SUBSCRIPTIONS)
      .where("creatorId", "==", creatorId)
      .where("status", "==", "pending")
      .get();

    if (subsSnap.empty) {
      return NextResponse.json({ message: "No subscribers to notify" });
    }

    const subscribers = subsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as any[];

    // 3. Send emails in chunks (to avoid hitting rate limits or timeout)
    const emailPromises = subscribers.map(async (sub) => {
      try {
        await sendVacationReturnEmail({
          to: sub.userEmail,
          creatorName: creator?.displayName || "Your Creator",
          creatorUsername: creator?.username || ""
        });

        // Mark as sent
        await adminDb.collection(COLLECTIONS.VACATION_SUBSCRIPTIONS).doc(sub.id).update({
          status: "sent",
          sentAt: FieldValue.serverTimestamp()
        });
      } catch (err) {
        console.error(`Failed to notify ${sub.userEmail}:`, err);
      }
    });

    await Promise.all(emailPromises);

    return NextResponse.json({ 
      message: `Notifications sent to ${subscribers.length} subscribers` 
    });
  } catch (error: any) {
    console.error("Notify Return Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
