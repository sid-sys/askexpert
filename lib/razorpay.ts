import Razorpay from "razorpay";

// Lazy singleton — same shape as lib/stripe.ts so client components can
// import the pure helpers below without bundling a Razorpay instance.
// (RAZORPAY_KEY_SECRET is server-only; instantiating in the browser would
// throw or worse, leak.)
let _razorpay: Razorpay | null = null;
export const razorpay: Razorpay = new Proxy({} as Razorpay, {
  get(_target, prop, receiver) {
    if (!_razorpay) {
      _razorpay = new Razorpay({
        key_id:     process.env.RAZORPAY_KEY_ID!,
        key_secret: process.env.RAZORPAY_KEY_SECRET!,
      });
    }
    const value = Reflect.get(_razorpay, prop, receiver);
    return typeof value === "function" ? value.bind(_razorpay) : value;
  },
});

// Re-export validateWebhookSignature as a static so the webhook route can
// verify without paying the singleton instantiation cost.
export const validateRazorpayWebhookSignature = Razorpay.validateWebhookSignature;

// ── INR platform-plan pricing (paise) ────────────────────────────────────────
// Mirrors PLAN_MONTHLY_FEE_CENTS in lib/stripe.ts. Paise has the same x100
// minor-unit convention as cents, so no helper changes needed downstream.
//
// ₹399/mo (Creator) and ₹799/mo (Pro) — standard Indian SaaS pricing,
// roughly $4.80 / $9.60 at ~₹83/USD. Adjust here if you want different
// regional pricing.
export const PLAN_MONTHLY_FEE_PAISE: Record<string, number> = {
  free:    0,
  creator: 39900,   // ₹399
  pro:     79900,   // ₹799
};

// Razorpay plan IDs (created via /api/razorpay/setup-products and stored in
// .env.local). Subscriptions need a pre-created Plan; you can't pass
// price_data inline like Stripe.
export const RAZORPAY_PLAN_IDS: Record<string, string | undefined> = {
  creator: process.env.RAZORPAY_CREATOR_PLAN_ID,
  pro:     process.env.RAZORPAY_PRO_PLAN_ID,
};
