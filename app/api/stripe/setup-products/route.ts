import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { adminDb, FieldValue } from "@/lib/firebase-admin";

// POST /api/stripe/setup-products
// One-time endpoint: creates Creator + Pro Products & Prices in Stripe
// then stores the price IDs in Firestore config so they can be used in .env.local
// ADMIN ONLY — protect in production with an admin check

export async function POST(req: NextRequest) {
  try {
    const { adminSecret } = await req.json();
    if (adminSecret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const results: Record<string, string> = {};

    // ── Creator Plan — $4.99/month + $29.94/year ──────────────────────────
    const creatorProduct = await stripe.products.create({
      name:        "AskExpert Creator Plan",
      description: "10% platform fee on all transactions. Custom branding & analytics.",
      metadata:    { plan: "creator" },
    });

    const creatorMonthlyPrice = await stripe.prices.create({
      product:      creatorProduct.id,
      unit_amount:  499,   // $4.99
      currency:     "usd",
      recurring:    { interval: "month" },
      metadata:     { plan: "creator", billing: "monthly" },
    });

    const creatorAnnualPrice = await stripe.prices.create({
      product:      creatorProduct.id,
      unit_amount:  2994,  // $29.94 ($4.99 × 6)
      currency:     "usd",
      recurring:    { interval: "year" },
      metadata:     { plan: "creator", billing: "annual" },
    });

    results["STRIPE_CREATOR_PRICE_ID"]        = creatorMonthlyPrice.id;
    results["STRIPE_CREATOR_ANNUAL_PRICE_ID"] = creatorAnnualPrice.id;

    // ── Pro Plan — $9.99/month + $59.94/year ──────────────────────────────
    const proProduct = await stripe.products.create({
      name:        "AskExpert Pro Plan",
      description: "0% platform fee. Priority support, advanced analytics, custom branding.",
      metadata:    { plan: "pro" },
    });

    const proMonthlyPrice = await stripe.prices.create({
      product:      proProduct.id,
      unit_amount:  999,   // $9.99
      currency:     "usd",
      recurring:    { interval: "month" },
      metadata:     { plan: "pro", billing: "monthly" },
    });

    const proAnnualPrice = await stripe.prices.create({
      product:      proProduct.id,
      unit_amount:  5994,  // $59.94 ($9.99 × 6)
      currency:     "usd",
      recurring:    { interval: "year" },
      metadata:     { plan: "pro", billing: "annual" },
    });

    results["STRIPE_PRO_PRICE_ID"]        = proMonthlyPrice.id;
    results["STRIPE_PRO_ANNUAL_PRICE_ID"] = proAnnualPrice.id;

    // ── Store in Firestore config for reference ────────────────────────────
    await adminDb.collection("config").doc("stripePrices").set({
      ...results,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      message: "Add these to your .env.local:",
      priceIds: results,
    });  
  } catch (err) {
    console.error("[setup-products] error:", err);
    return NextResponse.json({ error: "Setup failed" }, { status: 500 });
  }
}
