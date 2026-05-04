import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
    ],
  },
  serverExternalPackages: ["firebase-admin"],
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  org: "askexpert-org",
  project: "askexpert-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Source map upload auth token
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your Sentry bill.
  tunnelRoute: "/monitoring",
});
