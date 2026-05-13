import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { sendAskerConfirmationEmail, sendNewQuestionEmail, sendAnswerEmail, sendRefundEmail } from "@/lib/resend";

// Verifies any valid Firebase session (admin page already guards client-side who can reach this)
async function verifyFirebaseSession(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    return await adminAuth.verifyIdToken(token);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const session = await verifyFirebaseSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { emailType, to, creatorId } = await req.json();
  if (!to || !emailType) return NextResponse.json({ error: "Missing 'to' or 'emailType'" }, { status: 400 });

  // Fetch optional creator data for realistic response-time testing
  let testResponseTime = 72;
  let testCreatorName = "Jane Expert";

  if (creatorId) {
    const { adminDb } = await import("@/lib/firebase-admin");
    const creatorSnap = await adminDb.collection("users").doc(creatorId).get();
    if (creatorSnap.exists) {
      const data = creatorSnap.data()!;
      testResponseTime = data.responseTimeHours || 72;
      testCreatorName = data.displayName || "Jane Expert";
    }
  }

  const now  = new Date();
  const exp  = new Date(now.getTime() + testResponseTime * 60 * 60 * 1000).toISOString();

  try {
    let result;
    switch (emailType) {
      case "asker_confirmation":
        result = await sendAskerConfirmationEmail({
          to,
          creatorName: testCreatorName,
          question:    "What is the best way to grow my SaaS from 0 to $10k MRR?",
          price:       1500, // $15.00
          expiresAt:   exp,
          currency:    "usd",
          responseTimeHours: testResponseTime,
        });
        break;

      case "new_question_creator":
        result = await sendNewQuestionEmail({
          to,
          creatorName:           testCreatorName,
          question:              "What is the best way to grow my SaaS from 0 to $10k MRR?",
          askerEmail:            "test.asker@example.com",
          price:                 1500,
          category:              "Business Growth",
          requestedReplyFormat:  "text",
          dashboardUrl:          `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
          responseTimeHours: testResponseTime,
        });
        break;

      case "answer":
        result = await sendAnswerEmail({
          to,
          creatorName: testCreatorName,
          question:    "What is the best way to grow my SaaS from 0 to $10k MRR?",
          answer:      "Great question! Start by focusing on a very narrow ICP, price based on value not cost, and do 30 discovery calls before building anything else. Once you hit 5 customers, double down on what they have in common.",
          answerType:  "text",
        });
        break;

      case "refund":
        result = await sendRefundEmail({
          to,
          creatorName: testCreatorName,
          question:    "What is the best way to grow my SaaS from 0 to $10k MRR?",
          responseTimeHours: testResponseTime,
        });
        break;

      default:
        return NextResponse.json({ error: `Unknown emailType: ${emailType}` }, { status: 400 });
    }

    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    console.error("Test email error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
