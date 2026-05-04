
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

async function checkProcessedEvents() {
  try {
    console.log("--- Processed Events ---");
    const snap = await adminDb.collection("processedEvents").orderBy("processedAt", "desc").limit(5).get();
    snap.forEach(doc => {
      console.log(`Event: ${doc.id}`, doc.data());
    });

    console.log("\n--- Recent Questions ---");
    const qSnap = await adminDb.collection("questions").orderBy("createdAt", "desc").limit(3).get();
    qSnap.forEach(doc => {
      console.log(`Question: ${doc.id}`, {
        status: doc.data().status,
        followerEmail: doc.data().followerEmail,
        stripeSessionId: doc.data().stripeSessionId
      });
    });
  } catch (err) {
    console.error("Error:", err);
  }
}

checkProcessedEvents();
