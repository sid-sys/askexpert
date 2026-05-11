const admin = require('firebase-admin');
const serviceAccount = require('../firebase_apikey.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

(async () => {
  const snap = await db.collection('questions').orderBy('createdAt', 'desc').limit(5).get();
  console.log(`Found ${snap.size} recent questions:`);
  for (const doc of snap.docs) {
    const d = doc.data();
    console.log(`\n--- ${doc.id} ---`);
    console.log(`content: ${JSON.stringify(d.content)}`);
    console.log(`status: ${d.status}`);
    console.log(`createdAt: ${d.createdAt?.toDate?.()?.toISOString?.()}`);
    console.log(`pricePaid: ${d.pricePaid}`);
    console.log(`attachmentUrls: ${JSON.stringify(d.attachmentUrls)}`);
    console.log(`stripePaymentIntentId: ${d.stripePaymentIntentId}`);
    console.log(`stripeSessionId: ${d.stripeSessionId}`);
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
