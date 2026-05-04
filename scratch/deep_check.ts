import { adminDb } from "../lib/firebase-admin";

async function deepCheck() {
  console.log("🔍 Deep Checking Webhook Activity...");

  // Check processed events
  const eventsSnap = await adminDb.collection("processedEvents")
    .orderBy("processedAt", "desc")
    .limit(5)
    .get();

  console.log("\n--- Recent Processed Events ---");
  if (eventsSnap.empty) {
    console.log("📭 No events found.");
  } else {
    eventsSnap.forEach(doc => {
      const data = doc.data();
      console.log(`ID: ${doc.id} | Type: ${data.eventType} | At: ${data.processedAt?.toDate()}`);
    });
  }

  // Check recent questions
  const questionsSnap = await adminDb.collection("questions")
    .orderBy("createdAt", "desc")
    .limit(5)
    .get();

  console.log("\n--- Recent Questions ---");
  if (questionsSnap.empty) {
    console.log("📭 No questions found.");
  } else {
    questionsSnap.forEach(doc => {
      const data = doc.data();
      console.log(`ID: ${doc.id} | Status: ${data.status} | NotificationsSent: ${data.notificationsSent} | At: ${data.createdAt?.toDate()}`);
      if (data.notificationSummary) {
        console.log(`Summary:`, JSON.stringify(data.notificationSummary, null, 2));
      }
    });
  }

  // Check notification audit
  const auditSnap = await adminDb.collection("notificationAudit")
    .orderBy("timestamp", "desc")
    .limit(10)
    .get();

  console.log("\n--- Notification Audit ---");
  if (auditSnap.empty) {
    console.log("📭 No audit logs found.");
  } else {
    auditSnap.forEach(doc => {
      const data = doc.data();
      console.log(`ID: ${doc.id} | Type: ${data.type} | To: ${data.to} | Status: ${data.status} | At: ${data.timestamp?.toDate()}`);
      if (data.status === "error") {
        console.log(`Error:`, JSON.stringify(data.error, null, 2));
      }
    });
  }
}

deepCheck().catch(console.error);
