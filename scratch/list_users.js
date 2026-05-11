const admin = require('firebase-admin');
const serviceAccount = require('../firebase_apikey.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

(async () => {
  const snap = await db.collection('users').limit(50).get();
  console.log(`Found ${snap.size} users:`);
  for (const doc of snap.docs) {
    console.log(`docId=${doc.id}`);
    console.log(JSON.stringify(doc.data(), null, 2));
    console.log('---');
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
