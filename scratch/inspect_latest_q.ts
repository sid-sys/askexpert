import { adminDb } from "../lib/firebase-admin";

async function inspectLatestQuestions() {
  console.log("🔍 Fetching latest questions...");
  const snap = await adminDb.collection("questions").orderBy("createdAt", "desc").limit(5).get();
  
  if (snap.empty) {
    console.log("❌ No questions found.");
  } else {
    snap.forEach(doc => {
      const data = doc.data();
      console.log(`\n--- Question ID: ${doc.id} ---`);
      console.log(`- Status: ${data.status}`);
      console.log(`- Follower Email: ${data.followerEmail}`);
      console.log(`- Creator ID: ${data.creatorId}`);
      console.log(`- Created At: ${data.createdAt?.toDate()}`);
      console.log(`- notificationsSent: ${data.notificationsSent}`);
      console.log(`- notificationSummary: ${JSON.stringify(data.notificationSummary, null, 2)}`);
    });
  }

  process.exit(0);
}

inspectLatestQuestions().catch(err => {
  console.error(err);
  process.exit(1);
});
