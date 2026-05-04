
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

async function checkAudit() {
  try {
    const snap = await adminDb.collection("notificationAudit").orderBy("timestamp", "desc").limit(10).get();
    if (snap.empty) {
      console.log("No audit logs found.");
      return;
    }
    snap.forEach(doc => {
      console.log(`Audit: ${doc.id}`, doc.data());
    });
  } catch (err) {
    console.error("Error checking audit:", err);
  }
}

checkAudit();
