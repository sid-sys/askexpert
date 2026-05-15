// Single source of truth for currency-aware money display.
//
// All amounts in Firestore are stored in the currency's MINOR unit:
//   USD/EUR/GBP/CAD/AUD/SGD → cents
//   INR                    → paise
// Both follow the same x100 convention, so the math is identical — only
// the symbol differs. Each creator's currency lives on user.currency.

export const CURRENCY_SYMBOLS: Record<string, string> = {
  usd: "$",
  gbp: "£",
  eur: "€",
  inr: "₹",
  cad: "CA$",
  aud: "AU$",
  sgd: "S$",
};

export function getCurrencySymbol(currency?: string | null): string {
  return CURRENCY_SYMBOLS[(currency ?? "usd").toLowerCase()] || "$";
}

// Format an amount in minor units (cents/paise) as a display string.
//   formatMoney(500, "inr")                    → "₹5.00"
//   formatMoney(500, "usd")                    → "$5.00"
//   formatMoney(50000, "inr", { whole: true }) → "₹500"
//   formatMoney(100000, "usd", { compact: true }) → "$1k"
//   formatMoney(1000000, "inr", { compact: true }) → "₹10K"
//
// Compact uses uppercase "K"/"L" for INR (matching Indian convention —
// ₹1L = lakh = 100k) and lowercase "k"/"m" for everything else (SaaS
// pricing convention). Both kick in at ≥1000 of the major unit.
export function formatMoney(
  amountMinor: number | null | undefined,
  currency?: string | null,
  opts: { whole?: boolean; fractionDigits?: number; compact?: boolean } = {}
): string {
  const sym = getCurrencySymbol(currency);
  const amountMajor = Number(amountMinor ?? 0) / 100;

  if (opts.compact && Math.abs(amountMajor) >= 1000) {
    const isInr = (currency ?? "usd").toLowerCase() === "inr";
    if (isInr && Math.abs(amountMajor) >= 100_000) {
      // ₹1 Lakh = ₹100,000 — write as "₹1L", "₹10L"
      return `${sym}${trimZero(amountMajor / 100_000)}L`;
    }
    const suffix = isInr ? "K" : "k";
    return `${sym}${trimZero(amountMajor / 1000)}${suffix}`;
  }

  const digits = opts.whole ? 0 : (opts.fractionDigits ?? 2);
  return `${sym}${amountMajor.toFixed(digits)}`;
}

// Drop trailing ".0" so we render "1k" not "1.0k", but keep "1.5k".
function trimZero(n: number): string {
  const fixed = n.toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}

// ── Per-currency platform plan pricing ───────────────────────────────────────
// USD prices (cents) — the existing source of truth, unchanged.
// INR prices (paise) — what Indian creators see and pay via Razorpay.
//
// Lifetime caps follow the same currency split. The numeric value isn't a
// straight FX conversion — it's "round number that feels equivalent in each
// market." Adjust if you want different INR pricing.
export const PLAN_PRICES_MINOR: Record<string, Record<string, number>> = {
  usd: { free: 0, creator: 499,   pro: 999   },   // $4.99 / $9.99
  inr: { free: 0, creator: 39900, pro: 79900 },   // ₹399  / ₹799
};

export const PLAN_LIFETIME_CAPS_MINOR: Record<string, Record<string, number>> = {
  usd: { free: 100_000,    creator: 1_000_000, pro: Number.POSITIVE_INFINITY },   // $1k    / $10k   / ∞
  inr: { free: 1_000_000,  creator: 5_000_000, pro: Number.POSITIVE_INFINITY },   // ₹10K   / ₹50K   / ∞
};

export function getPlanPriceMinor(plan: string, currency?: string | null): number {
  const c = (currency ?? "usd").toLowerCase();
  const table = PLAN_PRICES_MINOR[c] ?? PLAN_PRICES_MINOR.usd;
  return table[plan.toLowerCase()] ?? 0;
}

export function getPlanLifetimeCapMinor(plan: string, currency?: string | null): number {
  const c = (currency ?? "usd").toLowerCase();
  const table = PLAN_LIFETIME_CAPS_MINOR[c] ?? PLAN_LIFETIME_CAPS_MINOR.usd;
  return table[plan.toLowerCase()] ?? table.free;
}

// ── Payout threshold (minor units) ───────────────────────────────────────────
// Creator must accumulate at least this much before requesting a payout.
// USD: $50 (5_000 cents)  |  INR: ₹1,000 (100_000 paise — set low so Indian
// creators can withdraw early; gateway/bank fees are typically a small
// fraction of ₹1k). Adjust here for different thresholds per market.
export const PAYOUT_THRESHOLD_MINOR: Record<string, number> = {
  usd: 5_000,
  inr: 100_000,
  gbp: 4_000,
  eur: 4_500,
  cad: 7_000,
  aud: 8_000,
  sgd: 7_000,
};

export function getPayoutThresholdMinor(currency?: string | null): number {
  const c = (currency ?? "usd").toLowerCase();
  return PAYOUT_THRESHOLD_MINOR[c] ?? PAYOUT_THRESHOLD_MINOR.usd;
}
