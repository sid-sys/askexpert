import { adminDb } from "../lib/firebase-admin.ts";

async function inspectLatestQuestion() {
  console.log("🔍 Fetching latest question...");
  const snap = await adminDb.collection("questions").orderBy("createdAt", "desc").limit(1).get();
  
  if (snap.empty) {
    console.log("❌ No questions found.");
  } else {
    const q = snap.docs[0].data();
    console.log("-------------------");
    console.log(`ID: ${snap.docs[0].id}`);
    console.log(`Status: ${q.status}`);
    console.log(`Follower Email: ${q.followerEmail}`);
    console.log(`Notifications Sent: ${q.notificationsSent}`);
    console.log(`Notification Summary: ${JSON.stringify(q.notificationSummary, null, 2)}`);
    console.log(`Created At: ${q.createdAt?.toDate()}`);
  }
  process.exit(0);
}

inspectLatestQuestion().catch(err => {
  console.error(err);
  process.exit(1);
});
