import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { adminDb, FieldValue } from "@/lib/firebase-admin";

// GET /api/stripe/connect/return?uid=xxx — Stripe redirects here after onboarding
export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/profile`);

  try {
    const userDoc = await adminDb.collection("users").doc(uid).get();
    const accountId = userDoc.data()?.stripeAccountId;

    if (accountId) {
      const account = await stripe.accounts.retrieve(accountId);
      if (account.details_submitted) {
        await adminDb.collection("users").doc(uid).update({
          stripeOnboardingComplete: true,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }
  } catch (err) {
    console.error("Stripe Connect return error:", err);
  }

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/profile?stripe=connected`);
}
