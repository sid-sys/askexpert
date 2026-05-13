// Lightweight first-touch attribution. Captures `document.referrer` and any
// utm_* query params the first time a visitor lands on the app, and stashes
// them in sessionStorage so that — when the visitor finally signs up some
// pages later — we can write the original source onto their user doc.
//
// We never overwrite an existing capture inside the same session: in-app
// navigations would otherwise clobber the real referrer with our own origin.
//
// Read once via `captureAttribution()` from a client-side mount effect
// (called from AuthProvider), and call `getAttribution()` at signup time
// to materialise the captured values.

const STORAGE_KEY = "askexpert.attribution.v1";

export type Attribution = {
  referrer:     string;       // raw document.referrer at landing time
  source:       string;       // utm_source || derived from referrer host || "direct"
  medium:       string;       // utm_medium || "" (e.g. "organic", "social", "email")
  campaign:     string;       // utm_campaign || ""
  landingPath:  string;       // first pathname visited
  capturedAt:   string;       // ISO timestamp of capture
};

function safeURL(input: string): URL | null {
  try { return new URL(input); } catch { return null; }
}

// Map common referrer hosts to a readable source label so the admin UI can
// group them. Keeps the list small — anything not matched falls back to the
// referring host.
function deriveSourceFromReferrer(refUrl: URL | null): string {
  if (!refUrl) return "direct";
  const host = refUrl.host.toLowerCase().replace(/^www\./, "");
  if (host.includes("google."))    return "google";
  if (host.includes("bing."))      return "bing";
  if (host.includes("duckduckgo")) return "duckduckgo";
  if (host.includes("twitter") || host === "t.co" || host.includes("x.com")) return "twitter";
  if (host.includes("facebook") || host === "fb.com" || host.includes("fb.me")) return "facebook";
  if (host.includes("instagram")) return "instagram";
  if (host.includes("linkedin")) return "linkedin";
  if (host.includes("youtube") || host === "youtu.be") return "youtube";
  if (host.includes("reddit"))   return "reddit";
  if (host.includes("tiktok"))   return "tiktok";
  if (host.includes("github."))  return "github";
  return host || "direct";
}

export function captureAttribution(): void {
  if (typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem(STORAGE_KEY)) return; // already captured this session

    const params  = new URLSearchParams(window.location.search);
    const refUrl  = safeURL(document.referrer || "");
    // If the referrer is our own origin (in-app navigation), treat as no referrer.
    const sameOrigin = refUrl && refUrl.origin === window.location.origin;
    const referrer   = sameOrigin ? "" : (document.referrer || "");

    const attribution: Attribution = {
      referrer,
      source:      params.get("utm_source")   || (referrer ? deriveSourceFromReferrer(safeURL(referrer)) : "direct"),
      medium:      params.get("utm_medium")   || "",
      campaign:    params.get("utm_campaign") || "",
      landingPath: window.location.pathname + window.location.search,
      capturedAt:  new Date().toISOString(),
    };

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // sessionStorage can throw in private modes — silently ignore; attribution
    // just defaults to "direct" for this signup.
  }
}

export function getAttribution(): Attribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as Attribution : null;
  } catch {
    return null;
  }
}
