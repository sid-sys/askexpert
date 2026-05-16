// Client-side hook + helpers for showing prices in the visitor's currency.
//
// Backed by /api/locale which returns { country, currency, rates }. The
// hook also honours ?country=XX in the URL for local testing, the same
// way /api/geo did before.

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";

export type LocaleInfo = {
  country: string | null;
  currency: string;          // visitor's display currency, lowercase ISO
  rates: Record<string, number>; // USD-base FX sheet
};

const DEFAULT_LOCALE: LocaleInfo = {
  country: null,
  currency: "usd",
  rates: { usd: 1 },
};

export function useVisitorLocale(): LocaleInfo {
  const [info, setInfo] = useState<LocaleInfo>(DEFAULT_LOCALE);
  useEffect(() => {
    let cancelled = false;
    const forced = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("country")
      : null;
    const url = forced ? `/api/locale?country=${encodeURIComponent(forced)}` : "/api/locale";
    fetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!cancelled && d) {
          setInfo({
            country:  d.country ?? null,
            currency: (d.currency ?? "usd").toLowerCase(),
            rates:    d.rates ?? { usd: 1 },
          });
        }
      })
      .catch(() => { /* silent — defaults to USD */ });
    return () => { cancelled = true; };
  }, []);
  return info;
}

// Convert minor units from one currency to another using a USD-base sheet.
// Same math as lib/fx.ts convertMinor() but pure-client: no Firestore /
// network call. Returns 0 if either side is missing from the sheet, so the
// caller can fall back to showing the source price.
export function convertMinorClient(
  amountMinor: number,
  fromCcy: string,
  toCcy: string,
  rates: Record<string, number>,
): number {
  const from = (fromCcy || "usd").toLowerCase();
  const to   = (toCcy   || "usd").toLowerCase();
  if (from === to) return Math.round(amountMinor);
  const fromRate = rates[from];
  const toRate   = rates[to];
  if (!fromRate || !toRate) return 0;
  return Math.round(amountMinor * (toRate / fromRate));
}

// Display helper — format a creator-priced amount in the visitor's currency.
// Useful for landing-page plan cards + creator profile prices. When the
// converted amount is zero (rate sheet missing the currency) we fall back
// to showing the source amount in its own currency rather than "$0".
export function formatFanPrice(
  amountMinor: number,
  sourceCurrency: string,
  locale: LocaleInfo,
  opts: { whole?: boolean; compact?: boolean } = {},
): string {
  const converted = convertMinorClient(amountMinor, sourceCurrency, locale.currency, locale.rates);
  if (converted === 0 && amountMinor > 0) {
    return formatMoney(amountMinor, sourceCurrency, opts);
  }
  return formatMoney(converted, locale.currency, opts);
}
