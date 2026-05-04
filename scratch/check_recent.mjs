
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import fs from 'fs';
import path from 'path';

// Manual env loading
const envPath = path.resolve('.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w\.\-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.length > 0 && value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      }
      process.env[key] = value;
    }
  });
}

const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

const app = initializeApp({
  credential: cert({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey,
  }),
});

const db = getFirestore(app);

async function check() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  console.log(`--- QUESTIONS CREATED SINCE ${oneHourAgo.toISOString()} ---`);
  const qSnap = await db.collection("questions")
    .where("createdAt", ">=", Timestamp.fromDate(oneHourAgo))
    .get();

  if (qSnap.empty) {
    console.log("None found.");
  } else {
    qSnap.forEach(doc => {
      console.log(`[${doc.id}] Created: ${doc.data().createdAt?.toDate()} | Content: ${doc.data().content}`);
    });
  }

  console.log("\n--- AUDIT LOGS SINCE ONE HOUR AGO ---");
  const aSnap = await db.collection("notificationAudit")
    .where("timestamp", ">=", Timestamp.fromDate(oneHourAgo))
    .get();

  if (aSnap.empty) {
    console.log("None found.");
  } else {
    aSnap.forEach(doc => {
      console.log(`[${doc.id}] ${doc.data().timestamp?.toDate()} | To: ${doc.data().to} | Status: ${doc.data().status}`);
    });
  }
}

check().catch(console.error);
