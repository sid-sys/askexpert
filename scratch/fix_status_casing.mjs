// fix_status_casing.mjs
// Normalizes all lowercase "pending" question statuses to uppercase "PENDING"
// Run: node scratch/fix_status_casing.mjs

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const serviceAccount = require("../firebase_apikey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function fixStatusCasing() {
  console.log("🔍 Finding questions with lowercase 'pending' status...");
  
  const snap = await db.collection("questions").where("status", "==", "pending").get();
  
  if (snap.empty) {
    console.log("✅ No lowercase 'pending' questions found. Nothing to fix.");
    return;
  }

  console.log(`📋 Found ${snap.size} questions to fix:\n`);

  for (const doc of snap.docs) {
    const q = doc.data();
    console.log(`  → ${doc.id} | email: ${q.followerEmail} | expiresAt: ${JSON.stringify(q.expiresAt)}`);
    await doc.ref.update({
      status: "PENDING",
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`    ✅ Fixed.`);
  }

  console.log(`\n🏁 Done. Fixed ${snap.size} documents.`);
}

fixStatusCasing().catch(err => {
  console.error("❌ Error:", err);
  process.exit(1);
});
