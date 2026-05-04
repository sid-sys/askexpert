import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Load env vars
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const privateKey = process.env.FIREBASE_PRIVATE_KEY
  ?.replace(/\\n/g, "\n")
  ?.replace(/^"|"$/g, "");

const app = initializeApp({
  credential: cert({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey,
  }),
}, "debug-app");

const db = getFirestore(app);

async function checkNotifications() {
  try {
    console.log("🔍 Fetching latest notifications from audit log...");
    const snapshot = await db.collection("notificationAudit")
      .orderBy("timestamp", "desc")
      .limit(20)
      .get();

    if (snapshot.empty) {
      console.log("📭 No notification logs found.");
      return;
    }

    snapshot.forEach(doc => {
      const data = doc.data();
      console.log("-------------------");
      console.log(`ID: ${doc.id}`);
      console.log(`Type: ${data.type}`);
      console.log(`Recipient: ${data.to || data.recipientEmail}`);
      console.log(`Status: ${data.status}`);
      console.log(`Timestamp: ${data.timestamp?.toDate().toISOString()}`);
      if (data.error) {
        console.log(`❌ Error: ${JSON.stringify(data.error, null, 2)}`);
      }
      if (data.resendResponse) {
        console.log(`✅ Resend Response: ${JSON.stringify(data.resendResponse, null, 2)}`);
      }
    });
  } catch (error) {
    console.error("Error fetching notification logs:", error);
  }
}

checkNotifications();
