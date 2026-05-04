const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

const privateKey = process.env.FIREBASE_PRIVATE_KEY
  ?.replace(/\\n/g, "\n")
  ?.replace(/^"|"$/g, "");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

const db = admin.firestore();

async function backupCollection(collectionName) {
  console.log(`📦 Backing up collection: ${collectionName}...`);
  const snap = await db.collection(collectionName).get();
  const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return data;
}

async function runBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(__dirname, "backups");
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);

  const filename = path.join(backupDir, `backup-${timestamp}.json`);
  
  const collections = ["users", "questions", "pendingPayouts", "notificationAudit"];
  const backupData = {};

  for (const col of collections) {
    backupData[col] = await backupCollection(col);
  }

  fs.writeFileSync(filename, JSON.stringify(backupData, null, 2));
  console.log(`✅ Backup saved to: ${filename}`);
}

runBackup().catch(console.error);
