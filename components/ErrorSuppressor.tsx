"use client";

import { useEffect } from "react";

/**
 * Suppresses known-harmless unhandled promise rejections:
 * 1. AbortError – Next.js cancels in-flight fetches on navigation (expected behaviour).
 * 2. Firebase "client is offline" – transient connectivity blip, retried automatically.
 */
export default function ErrorSuppressor() {
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (!reason) return;

      const name: string = reason?.name ?? "";
      const message: string = reason?.message ?? String(reason);

      const isAbort = name === "AbortError" || message.includes("AbortError");
      const isOffline = message.includes("client is offline");

      if (isAbort || isOffline) {
        event.preventDefault(); // stops Next.js from logging it
      }
    };

    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, []);

  return null;
}
