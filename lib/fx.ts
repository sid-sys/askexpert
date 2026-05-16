// Currency conversion with a 24h-cached rate sheet.
//
// All amounts in the app are stored in MINOR units (cents/paise — see
// lib/money.ts). Conversions therefore round to whole minor units at the
// boundary; we never carry fractional cents/paise.
//
// Rates come from open.er-api.com (no key, free — exchangerate.host now
// requires an API key as of 2024). The full sheet (USD as base) is cached
// for 24h in Firestore at /system/fxRates. Every payment captures the rate
// it used onto the record (`fxRate`/`fxCapturedAt`) so historical earnings
// stay frozen even when live rates move.

import { adminDb, FieldValue } from "@/lib/firebase-admin";

type RatesDoc = {
  base: "usd";
  rates: Record<string, number>; // e.g. { usd: 1, inr: 83.12, gbp: 0.78 }
  fetchedAt: FirebaseFirestore.Timestamp | Date;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const RATES_DOC_PATH = ["system", "fxRates"] as const;

let memoCache: { rates: Record<string, number>; fetchedAt: number } | null = null;

async function loadRatesFromFirestore(): Promise<RatesDoc | null> {
  const snap = await adminDb.collection(RATES_DOC_PATH[0]).doc(RATES_DOC_PATH[1]).get();
  if (!snap.exists) return null;
  return snap.data() as RatesDoc;
}

async function fetchFreshRates(): Promise<Record<string, number>> {
  // open.er-api.com returns the full sheet by default; we extract only the
  // currencies we display/charge in. Server-side fetch; Next caches by
  // default — opt out so a stale rate sheet doesn't survive past the 24h
  // window we control here.
  const res = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
  if (!res.ok) throw new Error(`open.er-api responded ${res.status}`);
  const data = await res.json();
  if (data?.result !== "success" || !data?.rates) {
    throw new Error(`open.er-api returned ${data?.result || "no rates"}`);
  }
  const wanted = ["USD", "INR", "GBP", "EUR", "CAD", "AUD", "SGD"];
  const lower: Record<string, number> = { usd: 1 };
  for (const k of wanted) {
    const v = (data.rates as Record<string, number>)[k];
    if (typeof v === "number") lower[k.toLowerCase()] = v;
  }
  return lower;
}

export async function getRates(): Promise<Record<string, number>> {
  const now = Date.now();
  if (memoCache && now - memoCache.fetchedAt < CACHE_TTL_MS) return memoCache.rates;

  const stored = await loadRatesFromFirestore();
  const storedAt = stored?.fetchedAt instanceof Date
    ? stored.fetchedAt.getTime()
    : (stored?.fetchedAt as any)?.toMillis?.() ?? 0;
  if (stored && now - storedAt < CACHE_TTL_MS) {
    memoCache = { rates: stored.rates, fetchedAt: storedAt };
    return stored.rates;
  }

  try {
    const fresh = await fetchFreshRates();
    await adminDb.collection(RATES_DOC_PATH[0]).doc(RATES_DOC_PATH[1]).set({
      base: "usd",
      rates: fresh,
      fetchedAt: FieldValue.serverTimestamp(),
    });
    memoCache = { rates: fresh, fetchedAt: now };
    return fresh;
  } catch (err) {
    // Network blip — fall back to whatever we last persisted, even if stale.
    if (stored?.rates) {
      memoCache = { rates: stored.rates, fetchedAt: storedAt };
      return stored.rates;
    }
    throw err;
  }
}

// Convert an amount in minor units between two currencies. The returned
// `rate` is the "1 from = `rate` to" factor at the time of conversion, so
// you can round-trip / audit the math later. Same-currency conversions
// short-circuit with rate=1 and no Firestore read.
export type ConvertResult = {
  amountMinor: number;
  rate: number;
  capturedAt: Date;
};

export async function convertMinor(
  amountMinor: number,
  fromCcy: string,
  toCcy: string,
): Promise<ConvertResult> {
  const from = (fromCcy || "usd").toLowerCase();
  const to   = (toCcy   || "usd").toLowerCase();
  if (from === to) {
    return { amountMinor: Math.round(amountMinor), rate: 1, capturedAt: new Date() };
  }
  const rates = await getRates();
  const fromRate = rates[from];
  const toRate   = rates[to];
  if (!fromRate || !toRate) {
    throw new Error(`Missing FX rate for ${from} or ${to}`);
  }
  // rates[] is "1 USD = X ccy". Cross-rate = toRate / fromRate.
  const cross = toRate / fromRate;
  return {
    amountMinor: Math.round(amountMinor * cross),
    rate: cross,
    capturedAt: new Date(),
  };
}

// Apply a previously-captured rate without hitting the network/cache.
// Used when a webhook lands and we want to re-derive the creator amount
// from the original amount + the rate we stamped at checkout time.
export function applyRate(amountMinor: number, rate: number): number {
  return Math.round(amountMinor * rate);
}
