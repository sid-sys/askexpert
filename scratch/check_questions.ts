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
}, "debug-app-questions");

const db = getFirestore(app);

async function checkQuestions() {
  try {
    console.log("🔍 Fetching latest questions...");
    const snapshot = await db.collection("questions")
      .orderBy("createdAt", "desc")
      .limit(5)
      .get();

    if (snapshot.empty) {
      console.log("📭 No questions found.");
      return;
    }

    snapshot.forEach(doc => {
      const data = doc.data();
      console.log("-------------------");
      console.log(`ID: ${doc.id}`);
      console.log(`Content: ${data.content}`);
      console.log(`Creator ID: ${data.creatorId}`);
      console.log(`Follower Email: ${data.followerEmail}`);
      console.log(`Notifications Sent: ${data.notificationsSent}`);
      console.log(`Status: ${data.status}`);
      console.log(`Timestamp: ${data.createdAt?.toDate().toISOString()}`);
    });
  } catch (error) {
    console.error("Error fetching questions:", error);
  }
}

checkQuestions();
