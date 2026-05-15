import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getMessaging } from "firebase-admin/messaging";
import { getStorage } from "firebase-admin/storage";

// Lazy singleton — defer credential parsing until the first real request.
// Eager init at module-load broke `next build`: Next's page-data analysis
// imports every route module to introspect it, which fired credential
// parsing during build with whatever PEM the local env happened to have.
// On the cloud builder env vars are clean; locally they may be malformed.
// Lazy init means the build never touches the key and prod request paths
// still work the moment a route is actually called.
function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0];

  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ?.replace(/\\n/g, "\n")
    ?.replace(/^"|"$/g, "");

  return initializeApp({
    credential: cert({
      projectId:   process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

// Each export is a Proxy that materialises its concrete admin instance on
// first property access. Same shape we use in lib/stripe.ts and
// lib/razorpay.ts — keeps imports cheap at build time.
function lazy<T extends object>(fn: () => T): T {
  let cached: T | null = null;
  return new Proxy({} as T, {
    get(_t, prop, receiver) {
      if (!cached) cached = fn();
      const v = Reflect.get(cached as object, prop, receiver);
      return typeof v === "function" ? v.bind(cached) : v;
    },
  });
}

export const adminDb        = lazy(() => getFirestore(getAdminApp()));
export const db             = adminDb; // Alias for compatibility
export const adminAuth      = lazy(() => getAuth(getAdminApp()));
export const adminMessaging = lazy(() => getMessaging(getAdminApp()));
export const adminStorage   = lazy(() => getStorage(getAdminApp()));
export { FieldValue };
