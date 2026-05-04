const admin = require('firebase-admin');

try {
  const serviceAccount = require('./firebase_apikey.json');
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
} catch (error) {
  console.error("Error initializing Firebase:", error);
  process.exit(1);
}

const db = admin.firestore();
const uid = 'hCSrGtHMViYcIT2CfYRhqPk7AF32';

async function setBalance() {
  try {
    const userRef = db.collection('users').doc(uid);
    await userRef.update({
      // All values must be in CENTS! 5000 cents = $50.00
      pendingPayoutBalance: 5000, 
      lifetimeEarnings: 5000,
      totalEarnings: 5000 
    });
    console.log(`Successfully updated all balances to 5000 cents ($50.00)`);
    process.exit(0);
  } catch (error) {
    console.error("Error updating balance:", error);
    process.exit(1);
  }
}

setBalance();
