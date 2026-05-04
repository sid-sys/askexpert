import { adminDb } from "../lib/firebase-admin";

async function checkQuestions() {
  console.log("🔍 Checking recent questions...");
  const snap = await adminDb.collection("questions").orderBy("createdAt", "desc").limit(5).get();
  
  if (snap.empty) {
    console.log("❌ No questions found.");
  } else {
    snap.forEach(doc => {
      const data = doc.data();
      console.log(`- [${data.createdAt?.toDate()}] ID: ${doc.id}`);
      console.log(`  Asker: ${data.followerEmail}, CreatorID: ${data.creatorId}`);
      console.log(`  Status: ${data.status}, Paid: ${data.pricePaid} ${data.currency || 'usd'}`);
      console.log(`  NotificationsSent: ${data.notificationsSent}`);
      console.log(`  Notification Summary: ${JSON.stringify(data.notificationSummary, null, 2)}`);
    });
  }

  process.exit(0);
}

checkQuestions().catch(err => {
  console.error(err);
  process.exit(1);
});
