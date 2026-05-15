import { NextRequest, NextResponse } from "next/server";

// GET /api/geo
// Returns the requesting visitor's ISO country code based on edge headers
// the host platform attaches. Used by client components that need to branch
// on country (e.g. the Indian-fan warning on USD-priced creator profiles).
//
// Header priority — first one we find wins:
//   x-nf-geo            (Netlify, JSON-encoded)
//   x-country           (Netlify simpler form)
//   x-vercel-ip-country (Vercel)
//   cf-ipcountry        (Cloudflare)
//
// In local dev none of these are set, so `country` is null. To force a
// country during development pass ?force=IN — handy for testing the
// fan-warning banner without standing up a tunnel.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const forced = url.searchParams.get("force");
  if (forced) {
    return NextResponse.json({ country: forced.toUpperCase(), source: "forced" });
  }

  // Netlify's "rich" geo header is a JSON blob; parse defensively.
  const nfGeoRaw = req.headers.get("x-nf-geo");
  if (nfGeoRaw) {
    try {
      const parsed = JSON.parse(nfGeoRaw);
      const code = parsed?.country?.code as string | undefined;
      if (code) return NextResponse.json({ country: code.toUpperCase(), source: "netlify" });
    } catch { /* fall through */ }
  }

  const candidates: Array<[string, string]> = [
    ["x-country",           "netlify"],
    ["x-vercel-ip-country", "vercel"],
    ["cf-ipcountry",        "cloudflare"],
  ];
  for (const [header, source] of candidates) {
    const v = req.headers.get(header);
    if (v && v.length === 2) {
      return NextResponse.json({ country: v.toUpperCase(), source });
    }
  }

  return NextResponse.json({ country: null, source: "unknown" });
}
