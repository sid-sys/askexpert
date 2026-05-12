// Removes mock subscription docs (and their nested messages subcollection)
// seeded by scratch/seed_mock_fans.js. Filter: { mock: true }.
const admin = require('firebase-admin');
const serviceAccount = require('../firebase_apikey.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function deleteCollection(ref) {
  const snap = await ref.limit(500).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return snap.size + (snap.size === 500 ? await deleteCollection(ref) : 0);
}

(async () => {
  const snap = await db.collection('subscriptions').where('mock', '==', true).get();
  console.log(`Found ${snap.size} mock subscriptions to delete.`);

  let totalSubs = 0, totalMessages = 0;
  for (const doc of snap.docs) {
    const messagesDeleted = await deleteCollection(doc.ref.collection('messages'));
    await doc.ref.delete();
    totalSubs++;
    totalMessages += messagesDeleted;
    console.log(`- ${doc.id} (${doc.data().followerName || doc.data().followerEmail}) · ${messagesDeleted} messages`);
  }
  console.log(`\nDeleted ${totalSubs} subscriptions and ${totalMessages} messages.`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
