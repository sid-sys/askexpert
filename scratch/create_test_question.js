
const admin = require('firebase-admin');
const serviceAccount = require('../firebase_apikey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function createQuestion() {
  const questionData = {
    content: "What is the weather?",
    followerEmail: "sidharthbabu96@gmail.com",
    creatorId: "eZAZfVS1E5eHNfFLUClscFOLeU02",
    status: "PENDING",
    pricePaid: 500,
    currency: "usd",
    isNew: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000)
  };

  const docRef = await db.collection('questions').add(questionData);
  console.log('Question ID:', docRef.id);
  process.exit(0);
}

createQuestion().catch(err => {
  console.error(err);
  process.exit(1);
});
