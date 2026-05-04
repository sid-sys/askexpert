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

async function checkBalance() {
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (doc.exists) {
      console.log(JSON.stringify(doc.data(), null, 2));
    } else {
      console.log("No such document!");
    }
    process.exit(0);
  } catch (error) {
    console.error("Error reading document:", error);
    process.exit(1);
  }
}

checkBalance();
