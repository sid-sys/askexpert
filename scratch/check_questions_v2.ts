
import { adminDb } from "./lib/firebase-admin";

async function checkQuestions() {
  console.log("🔍 Checking questions collection...");
  const snap = await adminDb.collection("questions")
    .orderBy("createdAt", "desc")
    .limit(5)
    .get();

  if (snap.empty) {
    console.log("📭 No questions found.");
    return;
  }

  snap.forEach(doc => {
    const data = doc.data();
    console.log(`--- ${doc.id} ---`);
    console.log(`Created: ${data.createdAt?.toDate()}`);
    console.log(`Content: ${data.content?.slice(0, 50)}...`);
    console.log(`Status: ${data.status}`);
    console.log(`Asker: ${data.followerEmail}`);
    console.log(`Creator: ${data.creatorId}`);
  });
}

checkQuestions().catch(console.error);
