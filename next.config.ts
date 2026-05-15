import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
    ],
  },
  serverExternalPackages: ["firebase-admin", "require-in-the-middle"],
  outputFileTracingRoot: __dirname,
  // ── Custom response headers ────────────────────────────────────────────────
  // Setting these in `netlify.toml` doesn't work — `@netlify/plugin-nextjs`
  // strips third-party header rules in favour of Next's own headers() config.
  // `same-origin-allow-popups` is required for Firebase Auth's Google
  // sign-in popup to call window.close() on itself; the default `same-origin`
  // policy blocks it and floods the console with COOP warnings.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        ],
      },
    ];
  },
};

export default nextConfig;
