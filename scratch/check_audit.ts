import { adminDb } from "../lib/firebase-admin";

async function checkAudit() {
  console.log("🔍 Checking Notification Audit...");
  const snap = await adminDb.collection("notificationAudit")
    .orderBy("timestamp", "desc")
    .limit(10)
    .get();

  if (snap.empty) {
    console.log("📭 No audit logs found.");
    return;
  }

  snap.forEach(doc => {
    const data = doc.data();
    console.log(`\n--- ${doc.id} ---`);
    console.log(`Type: ${data.type}`);
    console.log(`To: ${data.to}`);
    console.log(`Status: ${data.status}`);
    if (data.status === "error") {
      console.log(`Error:`, JSON.stringify(data.error, null, 2));
    }
    console.log(`Timestamp: ${data.timestamp?.toDate()}`);
  });
}

checkAudit().catch(console.error);
