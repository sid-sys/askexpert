const admin = require('firebase-admin');
const serviceAccount = require('../firebase_apikey.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  const snap = await db.collection('subscriptions').limit(50).get();
  console.log(`Found ${snap.size} subscriptions:`);
  for (const doc of snap.docs) {
    console.log(`--- ${doc.id} ---`);
    console.log(JSON.stringify(doc.data(), null, 2));
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
