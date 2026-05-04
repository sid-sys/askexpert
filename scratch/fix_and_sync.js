const admin = require('firebase-admin');
const serviceAccount = require('../firebase_apikey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function fixData() {
  const creatorId = 'hCSrGtHMViYcIT2CfYRhqPk7AF32';
  
  // 1. Fix responseTimeHours
  /*
  console.log('Updating responseTimeHours to 48...');
  await db.collection('users').doc(creatorId).update({
    responseTimeHours: 48
  });
  console.log('Updated responseTimeHours.');
  */

  // 2. Sync missing questions
  const missingQuestions = [
    {
      id: 'wd5lH9wYGLHyCGASaxPO',
      data: {
        content: '5',
        creatorCut: 4.25,
        creatorId: 'hCSrGtHMViYcIT2CfYRhqPk7AF32',
        creatorName: 'sidharth',
        currency: 'usd',
        expiresAt: admin.firestore.Timestamp.fromDate(new Date('2026-04-28T11:32:55.399Z')),
        feePercent: 15,
        followerEmail: 'sidharthbabu9@gmail.com',
        originalPrice: 5.00,
        payoutMethod: 'manual_bank',
        platformPlan: 'free',
        pppApplied: false,
        pricePaid: 5.00,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        paymentStatus: 'paid'
      }
    },
    {
      id: 'nCxC3TkBiB49hd7GRQdc',
      data: {
        content: 'bjhbjh',
        creatorCut: 4.25,
        creatorId: 'hCSrGtHMViYcIT2CfYRhqPk7AF32',
        creatorName: 'sidharth',
        currency: 'usd',
        expiresAt: admin.firestore.Timestamp.fromDate(new Date('2026-04-28T11:27:06.371Z')),
        feePercent: 15,
        followerEmail: 'sidharthbabu9@gmail.com',
        originalPrice: 5.00,
        payoutMethod: 'manual_bank',
        platformPlan: 'free',
        pppApplied: false,
        pricePaid: 5.00,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        paymentStatus: 'paid'
      }
    },
    {
      id: '1bbYGjhloNAH8cZqmxJB',
      data: {
        content: 'kmk',
        creatorCut: 4.25,
        creatorId: 'hCSrGtHMViYcIT2CfYRhqPk7AF32',
        creatorName: 'sidharth',
        currency: 'usd',
        expiresAt: admin.firestore.Timestamp.fromDate(new Date('2026-04-28T10:38:07.845Z')),
        feePercent: 15,
        followerEmail: 'sidharthbabu9@gmail.com',
        originalPrice: 5.00,
        payoutMethod: 'manual_bank',
        platformPlan: 'free',
        pppApplied: false,
        pricePaid: 5.00,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        paymentStatus: 'paid'
      }
    }
  ];

  for (const q of missingQuestions) {
    console.log(`Syncing question ${q.id}...`);
    await db.collection('questions').doc(q.id).set(q.data);
    console.log(`Synced question ${q.id}.`);
  }
}

fixData().catch(console.error);
