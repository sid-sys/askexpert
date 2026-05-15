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
};

export default nextConfig;
