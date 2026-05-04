import { adminDb } from "../lib/firebase-admin.js";

async function checkAudit() {
  console.log("🔍 Checking Notification Audit Logs...");
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
    console.log(`[${data.timestamp?.toDate()?.toISOString()}] Type: ${data.type} | To: ${data.to} | Status: ${data.status}`);
    if (data.status === "error") {
      console.log("❌ Error:", JSON.stringify(data.error, null, 2));
    }
  });
}

checkAudit().catch(console.error);
