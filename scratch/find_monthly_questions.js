const admin = require('firebase-admin');
const serviceAccount = require('../firebase_apikey.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  const snap = await db.collection('questions')
    .where('content', '==', 'Monthly subscription')
    .limit(10)
    .get();
  console.log(`Found ${snap.size} "Monthly subscription" question docs:`);
  for (const d of snap.docs) {
    const data = d.data();
    console.log(`\n--- ${d.id} ---`);
    console.log(`createdAt: ${data.createdAt?.toDate?.()?.toISOString?.()}`);
    console.log(`pricePaid: ${data.pricePaid}`);
    console.log(`status: ${data.status}`);
    console.log(`creatorId: ${data.creatorId}`);
    console.log(`followerEmail: ${data.followerEmail}`);
    console.log(`followerUid: ${data.followerUid}`);
    console.log(`stripeSessionId: ${data.stripeSessionId}`);
    console.log(`stripePaymentIntentId: ${data.stripePaymentIntentId}`);
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
