import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// ── Platform fee tiers (tied to creator's platform plan) ──────────────────────
// Free: 15%  |  Creator ($4.99/mo): 5%  |  Pro ($9.99/mo): 0%
export const PLATFORM_FEE_MAP: Record<string, number> = {
  free:    15,
  creator: 5,
  pro:     0,
};

export function getPlatformFeePercent(plan = "free"): number {
  return PLATFORM_FEE_MAP[plan.toLowerCase()] ?? 15;
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
