import { adminDb } from "./lib/firebase-admin.js";

async function check() {
  console.log("--- Latest Questions ---");
  const qs = await adminDb.collection("questions").orderBy("createdAt", "desc").limit(5).get();
  qs.forEach(doc => {
    const data = doc.data();
    console.log(`Q ID: ${doc.id}`);
    console.log(`- notificationsSent: ${data.notificationsSent}`);
    console.log(`- notificationSummary: ${JSON.stringify(data.notificationSummary)}`);
    console.log(`- createdAt: ${data.createdAt?.toDate?.()}`);
  });

  console.log("\n--- Latest Notification Audit ---");
  const audit = await adminDb.collection("notificationAudit").orderBy("timestamp", "desc").limit(5).get();
  audit.forEach(doc => {
    const data = doc.data();
    console.log(`Audit ID: ${doc.id}`);
    console.log(`- to: ${data.to}`);
    console.log(`- subject: ${data.subject}`);
    console.log(`- status: ${data.status}`);
    console.log(`- error: ${JSON.stringify(data.error)}`);
    console.log(`- timestamp: ${data.timestamp?.toDate?.()}`);
  });
}

check().catch(console.error);
