
import { adminDb } from "../lib/firebase-admin.js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

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

checkUser("sid");
