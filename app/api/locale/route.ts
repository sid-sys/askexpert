import { NextRequest, NextResponse } from "next/server";
import { currencyForCountry } from "@/lib/money";
import { getRates } from "@/lib/fx";

// GET /api/locale
// Single endpoint the landing page + public profile call to localise prices.
// Returns the visitor's country (same logic as /api/geo), the currency we
// should show prices in for that country, and a snapshot of FX rates so
// the client can compute conversions without further round-trips.
//
// Delegates rate-fetching to lib/fx's getRates() — same 24h cache used by
// checkout-side conversions, so the first visitor primes the cache and
// everyone after benefits. exchangerate.host fetch costs ~200ms once a day.
//
// Response shape:
//   { country: "IN" | null, currency: "inr", rates: { usd: 1, inr: 83.12, … }, source: "netlify" }

function detectCountry(req: NextRequest, forced: string | null): { country: string | null; source: string } {
  if (forced) return { country: forced.toUpperCase(), source: "forced" };

  const nfGeoRaw = req.headers.get("x-nf-geo");
  if (nfGeoRaw) {
    try {
      const parsed = JSON.parse(nfGeoRaw);
      const code = parsed?.country?.code as string | undefined;
      if (code) return { country: code.toUpperCase(), source: "netlify" };
    } catch { /* fall through */ }
  }

  const candidates: Array<[string, string]> = [
    ["x-country",           "netlify"],
    ["x-vercel-ip-country", "vercel"],
    ["cf-ipcountry",        "cloudflare"],
  ];
  for (const [header, source] of candidates) {
    const v = req.headers.get(header);
    if (v && v.length === 2) return { country: v.toUpperCase(), source };
  }

  return { country: null, source: "unknown" };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const forced = url.searchParams.get("country") ?? url.searchParams.get("force");

  const { country, source } = detectCountry(req, forced);
  const currency = currencyForCountry(country);

  // Best-effort rate fetch. On a fresh project (cache empty + upstream
  // unreachable) we still return a usable response — the client just
  // falls back to creator-currency display for that pageview.
  let rates: Record<string, number> = { usd: 1 };
  try {
    rates = await getRates();
  } catch {
    /* fall through with the stub sheet */
  }

  return NextResponse.json({ country, currency, rates, source });
}
