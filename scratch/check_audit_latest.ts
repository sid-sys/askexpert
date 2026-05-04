
import { adminDb } from "./lib/firebase-admin";

async function checkAudit() {
  console.log("🔍 Checking notificationAudit collection...");
  const snap = await adminDb.collection("notificationAudit")
    .orderBy("timestamp", "desc")
    .limit(5)
    .get();

  if (snap.empty) {
    console.log("📭 No audit logs found.");
    return;
  }

  snap.forEach(doc => {
    const data = doc.data();
    console.log(`--- ${doc.id} ---`);
    console.log(`Timestamp: ${data.timestamp?.toDate()}`);
    console.log(`To: ${data.to}`);
    console.log(`Type: ${data.type}`);
    console.log(`Status: ${data.status}`);
    if (data.error) console.log(`Error: ${JSON.stringify(data.error, null, 2)}`);
  });
}

checkAudit().catch(console.error);
