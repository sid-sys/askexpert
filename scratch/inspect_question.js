const admin = require('firebase-admin');
const serviceAccount = require('../firebase_apikey.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  const id = '4qyIfQn7eTo6h8KlLIws';
  const snap = await db.collection('questions').doc(id).get();
  console.log('exists:', snap.exists);
  console.log('FULL DOC DATA:');
  console.log(JSON.stringify(snap.data(), null, 2));
  console.log('Field keys:', Object.keys(snap.data() || {}));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
