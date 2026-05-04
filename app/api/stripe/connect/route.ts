import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { adminDb, adminAuth, FieldValue } from "@/lib/firebase-admin";

// POST /api/stripe/connect — creates Stripe Connect Express account + onboarding link
export async function POST(req: NextRequest) {
  try {
    // Get user ID from auth header (client sends Firebase ID token)
    const authHeader = req.headers.get("Authorization") || "";
    const idToken = authHeader.replace("Bearer ", "");

    // Verify Firebase token server-side
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    // Get user doc
    const userDoc = await adminDb.collection("users").doc(uid).get();
    const userData = userDoc.data();

    let accountId = userData?.stripeAccountId;

    // Create Stripe account if not exists
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { firebaseUid: uid },
      });
      accountId = account.id;
      await adminDb.collection("users").doc(uid).update({ 
        stripeAccountId: accountId,
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/profile?stripe=refresh`,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/stripe/connect/return?uid=${uid}`,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (err: any) {
    console.error("Stripe Connect error:", err);
    return NextResponse.json({ error: err.message || "Connect setup failed" }, { status: 500 });
  }
}
