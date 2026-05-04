import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { adminDb, adminAuth, FieldValue } from "@/lib/firebase-admin";

// POST /api/stripe/billing-portal
// Redirects creator to Stripe Customer Portal to manage their platform plan
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const idToken    = authHeader.replace("Bearer ", "");

    // Verify Firebase token
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid     = decoded.uid;

    const userSnap = await adminDb.collection("users").doc(uid).get();
    const userData = userSnap.data();

    let customerId = userData?.stripeCustomerId as string | undefined;

    // If no customer ID yet, try to create one linked to their email
    if (!customerId) {
      const customers = await stripe.customers.list({ email: decoded.email!, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      } else {
        const customer = await stripe.customers.create({
          email:    decoded.email!,
          metadata: { firebaseUid: uid },
        });
        customerId = customer.id;
      }
      await adminDb.collection("users").doc(uid).set(
        { 
          stripeCustomerId: customerId,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }

    const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL}/profile?billing=updated`;

    const session = await stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: returnUrl,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("[billing-portal] error:", err);
    return NextResponse.json({ error: err.message || "Could not open billing portal" }, { status: 500 });
  }
}
