import { adminDb } from "../lib/firebase-admin";

async function checkTodayQuestions() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  console.log(`🔍 Checking questions created since ${today.toISOString()}...`);
  const snap = await adminDb.collection("questions").where("createdAt", ">=", today).get();
  
  if (snap.empty) {
    console.log("❌ No questions found today.");
  } else {
    console.log(`✅ Found ${snap.size} questions today.`);
    snap.forEach(doc => {
      const data = doc.data();
      console.log(`\n--- Question ID: ${doc.id} ---`);
      console.log(`- Status: ${data.status}`);
      console.log(`- notificationsSent: ${data.notificationsSent}`);
      console.log(`- notificationSummary: ${JSON.stringify(data.notificationSummary, null, 2)}`);
    });
  }

  process.exit(0);
}

checkTodayQuestions().catch(err => {
  console.error(err);
  process.exit(1);
});
