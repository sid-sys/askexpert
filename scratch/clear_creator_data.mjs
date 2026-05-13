// clear_creator_data.mjs ─ Wipes all transactional data for a single creator
// account (questions, subscriptions, payout records) and resets every cached
// earnings / payout counter on their user doc to zero. The user doc itself
// (profile, username, settings) is preserved.
//
// Usage:  node scratch/clear_creator_data.mjs <email>
//         node scratch/clear_creator_data.mjs sidharthbabu9@gmail.com

import admin from "firebase-admin";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}
const adminDb = admin.firestore();

const TARGET_EMAIL = (process.argv[2] || "sidharthbabu9@gmail.com").toLowerCase();

// Collections that hold per-creator transactional rows. Each entry is the
// collection name plus the field we filter on. The user doc itself is NOT in
// this list — we reset counters on it rather than delete it.
const CREATOR_SCOPED_COLLECTIONS = [
  { name: "questions",                field: "creatorId" },
  { name: "subscriptions",            field: "creatorId" },
  { name: "pendingPayouts",           field: "creatorId" },
  { name: "payouts",                  field: "creatorId" },
  { name: "vacation_subscriptions",   field: "creatorId" },
  { name: "reviews",                  field: "creatorId" },
  { name: "notificationAudit",        field: "creatorId" },
];

// Cached counter fields on the user doc that must go back to 0 after the
// transactional rows are deleted. Anything not in this list (displayName,
// username, perQuestionPrice, payoutMethod, bankDetails, etc.) is left alone.
const COUNTER_RESET = {
  totalEarnings:           0,
  totalCreatorNet:         0,
  totalPlatformFee:        0,
  oneTimeNetEarnings:      0,
  subscriptionNetEarnings: 0,
  pendingPayoutBalance:    0,
  paymentDue:              false,
  paymentDueCents:         0,
};

async function deleteInBatches(collName, field, value) {
  const snap = await adminDb.collection(collName).where(field, "==", value).get();
  if (snap.empty) {
    console.log(`  ${collName}: 0 docs`);
    return 0;
  }
  // Firestore batched writes are capped at 500 per batch.
  let count = 0;
  for (let i = 0; i < snap.docs.length; i += 500) {
    const batch = adminDb.batch();
    snap.docs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
    await batch.commit();
    count += Math.min(500, snap.docs.length - i);
  }
  console.log(`  ${collName}: ${count} deleted`);
  return count;
}

async function main() {
  console.log(`\n🔎 Looking up user by email: ${TARGET_EMAIL}`);
  const userSnap = await adminDb
    .collection("users")
    .where("email", "==", TARGET_EMAIL)
    .limit(1)
    .get();

  if (userSnap.empty) {
    console.error(`❌ No user found with email ${TARGET_EMAIL}`);
    process.exit(1);
  }

  const userDoc = userSnap.docs[0];
  const uid     = userDoc.id;
  const data    = userDoc.data();
  console.log(`✅ Found uid=${uid}  displayName="${data.displayName || "(none)"}"`);

  console.log(`\n🧹 Deleting creator-scoped rows…`);
  let totalDeleted = 0;
  for (const { name, field } of CREATOR_SCOPED_COLLECTIONS) {
    totalDeleted += await deleteInBatches(name, field, uid);
  }
  console.log(`   total docs deleted: ${totalDeleted}`);

  console.log(`\n♻️  Resetting cached counters on users/${uid}…`);
  await adminDb.collection("users").doc(uid).set(
    { ...COUNTER_RESET, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true },
  );
  Object.entries(COUNTER_RESET).forEach(([k, v]) => console.log(`  ${k} → ${v}`));

  console.log(`\n✅ Done. ${TARGET_EMAIL} now has zero transactional history.`);
  process.exit(0);
}

main().catch(err => {
  console.error("❌ Script failed:", err);
  process.exit(1);
});
