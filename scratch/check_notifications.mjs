import { db } from "../lib/firebase-admin.js";

async function checkNotifications() {
  try {
    console.log("Fetching latest notifications from audit log...");
    const snapshot = await db.collection("notificationAudit")
      .orderBy("timestamp", "desc")
      .limit(10)
      .get();

    if (snapshot.empty) {
      console.log("No notification logs found.");
      return;
    }

    snapshot.forEach(doc => {
      const data = doc.data();
      console.log("-------------------");
      console.log(`ID: ${doc.id}`);
      console.log(`Type: ${data.type}`);
      console.log(`Recipient: ${data.recipientEmail}`);
      console.log(`Status: ${data.status}`);
      console.log(`Timestamp: ${data.timestamp?.toDate().toISOString()}`);
      if (data.error) {
        console.log(`Error: ${JSON.stringify(data.error)}`);
      }
      if (data.resendResponse) {
        console.log(`Resend Response: ${JSON.stringify(data.resendResponse)}`);
      }
    });
  } catch (error) {
    console.error("Error fetching notification logs:", error);
  }
}

checkNotifications();
