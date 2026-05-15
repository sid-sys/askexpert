import { NextResponse } from "next/server";
import { adminDb, FieldValue } from "@/lib/firebase-admin";
import { COLLECTIONS } from "@/lib/types";
import { sendVacationConfirmationEmail } from "@/lib/resend";

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

    // Fire-and-forget confirmation email so the fan gets immediate proof
    // they're on the list. Earlier the toast said "We'll email you" but
    // nothing was actually sent until the creator came back — failing the
    // user's expectation. Now they get something in their inbox right away.
    try {
      const creatorSnap = await adminDb.collection(COLLECTIONS.USERS).doc(creatorId).get();
      const creator = creatorSnap.data();
      if (creator) {
        await sendVacationConfirmationEmail({
          to:               userEmail,
          creatorName:      creator.displayName || creator.username || "the creator",
          creatorUsername:  creator.username || "",
          expectedReturn:   creator.vacationUntil?.toDate?.() ?? null,
        });
      }
    } catch (e) {
      // Don't fail the request if email send breaks — the doc is already
      // written, so the fan will still be notified when the creator returns.
      console.error("[vacation/subscribe] confirmation email failed:", e);
    }

    return NextResponse.json({ message: "Subscribed successfully" });
  } catch (error: any) {
    console.error("Subscription Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
