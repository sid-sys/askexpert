
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
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
  console.log("--- LATEST QUESTIONS ---");
  const qSnap = await db.collection("questions").orderBy("createdAt", "desc").limit(3).get();
  qSnap.forEach(doc => {
    console.log(`[${doc.id}] Created: ${doc.data().createdAt?.toDate()} | Status: ${doc.data().status} | Asker: ${doc.data().followerEmail}`);
  });

  console.log("\n--- LATEST NOTIFICATION AUDIT ---");
  const aSnap = await db.collection("notificationAudit").orderBy("timestamp", "desc").limit(5).get();
  aSnap.forEach(doc => {
    const d = doc.data();
    console.log(`[${doc.id}] ${d.timestamp?.toDate()} | To: ${d.to} | Type: ${d.type} | Status: ${d.status}`);
    if (d.error) console.log(`   Error: ${JSON.stringify(d.error)}`);
  });
}

check().catch(console.error);
