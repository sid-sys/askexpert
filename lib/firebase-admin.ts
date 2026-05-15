import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getMessaging } from "firebase-admin/messaging";
import { getStorage } from "firebase-admin/storage";

// Eager singleton at module-load. The Lambda runtime executed this with
// proven success for months; we briefly tried a Proxy-based lazy variant
// (commit 768677a) but the Proxy receiver semantics tripped firebase-
// admin's internal getters once bundled and every route 502'd.
//
// Eager init *does* crash `next build` whenever the local .env.local has
// a malformed FIREBASE_PRIVATE_KEY — Next's page-data analysis imports
// every route to introspect it, which fires this init. To keep build
// usable on a dev machine with a malformed local key, we swallow the
// init error during build only. Runtime requests on a properly-configured
// host (Netlify, Vercel) never hit the catch.
function getAdminApp(): App | null {
  if (getApps().length > 0) return getApps()[0];

  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ?.replace(/\\n/g, "\n")
    ?.replace(/^"|"$/g, "");

  try {
    return initializeApp({
      credential: cert({
        projectId:   process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
  } catch (err) {
    // Re-throw at runtime so a misconfigured production env fails loud
    // instead of returning null adminDb to every route. Only the build
    // phase is allowed to skip.
    if (process.env.NEXT_PHASE !== "phase-production-build") throw err;
    // eslint-disable-next-line no-console
    console.warn("[firebase-admin] init skipped during next build:", (err as Error).message);
    return null;
  }
}

const adminApp = getAdminApp();

// Non-null assertion on `adminApp!` keeps the export types as the proper
// firebase-admin instances (so callers like runTransaction infer their
// callback args correctly). The only path that produces a null adminApp
// is build-phase env failure — and at build time these exports are never
// dereferenced, only imported for type analysis.
export const adminDb        = getFirestore(adminApp!);
export const db             = adminDb; // Alias for compatibility
export const adminAuth      = getAuth(adminApp!);
export const adminMessaging = getMessaging(adminApp!);
export const adminStorage   = getStorage(adminApp!);
export { FieldValue };
