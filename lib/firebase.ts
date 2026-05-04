import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Singleton Firebase app
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Firestore with IndexedDB persistence.
let db: ReturnType<typeof getFirestore>;

if (getApps().length > 0) {
  // If app exists, try to get existing firestore instance first
  db = getFirestore(app);
} else {
  // First time — initialize with persistence
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
}

import { getStorage } from "firebase/storage";

export { app, db };
export const auth = getAuth(app);
export const storage = getStorage(app);
export default app;
