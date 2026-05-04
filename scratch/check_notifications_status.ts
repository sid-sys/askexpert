import { adminDb } from "../lib/firebase-admin";

async function checkNotifications() {
  console.log("🔍 Checking notification audit...");
  const snap = await adminDb.collection("notificationAudit").orderBy("timestamp", "desc").limit(10).get();
  
  if (snap.empty) {
    console.log("❌ No notification audit records found.");
  } else {
    snap.forEach(doc => {
      const data = doc.data();
      console.log(`- [${data.timestamp?.toDate()}] ${data.type} to ${data.to}: ${data.status}`);
      if (data.error) {
        console.log(`  Error: ${JSON.stringify(data.error)}`);
      }
    });
  }

  console.log("\n🔍 Checking processed events...");
  const eventSnap = await adminDb.collection("processedEvents").orderBy("processedAt", "desc").limit(5).get();
  if (eventSnap.empty) {
    console.log("❌ No processed events found.");
  } else {
    eventSnap.forEach(doc => {
      const data = doc.data();
      console.log(`- [${data.processedAt?.toDate()}] ${data.eventType} - ${data.stripeSessionId || 'no session id'}`);
    });
  }

  process.exit(0);
}

checkNotifications().catch(err => {
  console.error(err);
  process.exit(1);
});
