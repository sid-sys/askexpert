import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getMessaging } from "firebase-admin/messaging";
import { getStorage } from "firebase-admin/storage";

// Singleton — only init once across all API routes
function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0];

  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ?.replace(/\\n/g, "\n")
    ?.replace(/^"|"$/g, ""); // Remove leading/trailing quotes if present

  return initializeApp({
    credential: cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

const adminApp = getAdminApp();

export const adminDb      = getFirestore(adminApp);
export const db           = adminDb; // Alias for compatibility
export const adminAuth    = getAuth(adminApp);
export const adminMessaging = getMessaging(adminApp);
export const adminStorage = getStorage(adminApp);
export { FieldValue };
