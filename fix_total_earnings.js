const admin = require('firebase-admin');

try {
  const serviceAccount = require('./firebase_apikey.json');
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
} catch (error) {
  console.error("Error initializing Firebase:", error.message);
  process.exit(1);
}

const db = admin.firestore();

async function setTotalEarnings() {
  const usersRef = db.collection('users');
  const snapshot = await usersRef.where('username', '==', 'sid').get();

  if (snapshot.empty) {
    console.log('No user found with username sid.');
    process.exit(0);
  }

  const userDoc = snapshot.docs[0];
  await userDoc.ref.update({
    totalEarnings: 5000,
    pendingPayoutBalance: 5000
  });

  console.log(`Successfully updated totalEarnings and pendingPayoutBalance to 5000 for user sid (ID: ${userDoc.id})`);
  process.exit(0);
}

setTotalEarnings();
