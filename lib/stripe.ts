import Stripe from "stripe";

// Lazy singleton so client components can import the pure helpers below
// (e.g. getPlatformFeePercent) without bundling a Stripe instance — which
// would throw "Neither apiKey nor config.authenticator provided" in the
// browser, where STRIPE_SECRET_KEY is intentionally not exposed.
let _stripe: Stripe | null = null;
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const value = Reflect.get(_stripe, prop, receiver);
    return typeof value === "function" ? value.bind(_stripe) : value;
  },
});

// ── Platform fee tiers (tied to creator's platform plan) ──────────────────────
// Free: 20%  |  Creator ($4.99/mo): 10%  |  Pro ($9.99/mo): 0%
// Applies uniformly to one-time question payments AND monthly fan
// subscriptions — both routes call computeApplicationFee() / getPlatformFeePercent()
// against the creator's `platformPlan` at payment time.
export const PLATFORM_FEE_MAP: Record<string, number> = {
  free:    20,
  creator: 10,
  pro:     0,
};

export function getPlatformFeePercent(plan = "free"): number {
  return PLATFORM_FEE_MAP[plan.toLowerCase()] ?? 20;
}

/** Returns application fee in cents (whole number) */
export function computeApplicationFee(amountCents: number, plan = "free"): number {
  const pct = getPlatformFeePercent(plan);
  return Math.round(amountCents * (pct / 100));
}

/** Creator's cut in cents after platform fee */
export function computeCreatorCut(amountCents: number, plan = "free"): number {
  return amountCents - computeApplicationFee(amountCents, plan);
}

// ── Lifetime earning caps (cents) ────────────────────────────────────────────
// Free creators can earn up to $1k total before the cap kicks in. Creator
// plan raises that to $10k lifetime. Pro is uncapped. Crossing the cap
// triggers an auto-upgrade attempt that's paid out of the creator's accrued
// earnings.
export const PLAN_LIFETIME_CAP_CENTS: Record<string, number> = {
  free:    100_000,    // $1,000
  creator: 1_000_000,  // $10,000
  pro:     Number.POSITIVE_INFINITY,
};

export function getLifetimeCapCents(plan = "free"): number {
  return PLAN_LIFETIME_CAP_CENTS[plan.toLowerCase()] ?? PLAN_LIFETIME_CAP_CENTS.free;
}

// Monthly subscription price for each paid plan, in cents. Used by the
// auto-upgrade flow when a creator exceeds their earning cap and we need to
// deduct the next tier's fee from their accrued earnings.
export const PLAN_MONTHLY_FEE_CENTS: Record<string, number> = {
  free:    0,
  creator: 499,   // $4.99
  pro:     999,   // $9.99
};

export function nextPlanTier(plan: string): "creator" | "pro" | null {
  const p = plan.toLowerCase();
  if (p === "free") return "creator";
  if (p === "creator") return "pro";
  return null; // pro has no higher tier
}
