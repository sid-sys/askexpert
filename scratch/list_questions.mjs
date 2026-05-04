
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

async function listQuestions() {
  try {
    const snap = await adminDb.collection("questions").orderBy("createdAt", "desc").limit(5).get();
    if (snap.empty) {
      console.log("No questions found.");
      return;
    }
    snap.forEach(doc => {
      const data = doc.data();
      console.log(`Question: ${doc.id}`);
      console.log(` - Follower Email: ${data.followerEmail}`);
      console.log(` - Creator ID: ${data.creatorId}`);
      console.log(` - Status: ${data.status}`);
      console.log(` - Created At: ${data.createdAt?.toDate?.() || data.createdAt}`);
      console.log("-------------------");
    });
  } catch (err) {
    console.error("Error listing questions:", err);
  }
}

listQuestions();
