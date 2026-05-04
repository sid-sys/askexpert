
import admin from "firebase-admin";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const adminDb = admin.firestore();

async function checkUser(uid) {
  const snap = await adminDb.collection("users").doc(uid).get();
  if (!snap.exists) {
    console.log(`User ${uid} not found`);
    return;
  }
  const data = snap.data();
  console.log(`User ${uid} data:`, {
    email: data.email,
    displayName: data.displayName,
    platformPlan: data.platformPlan,
    stripeOnboardingComplete: data.stripeOnboardingComplete
  });
}

checkUser("hCSrGtHMViYcIT2CfYRhqPk7AF32");
