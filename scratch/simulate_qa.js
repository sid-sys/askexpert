const admin = require('firebase-admin');
const serviceAccount = require('../firebase_apikey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function simulateQA() {
  try {
    // 1. Get creator 'sidharth'
    const snapshot = await db.collection('users').where('username', '==', 'sid').get();
    if (snapshot.empty) {
      console.log('User sid not found');
      process.exit(1);
    }
    const creatorId = snapshot.docs[0].id;
    console.log('Creator ID:', creatorId);

    // 2. Create the answered question
    const questionData = {
      content: "can you see this image",
      followerName: "sky",
      followerEmail: "sidharthbabu96@gmail.com",
      creatorId: creatorId,
      status: "ANSWERED", 
      pricePaid: 1000,
      currency: "usd",
      isNew: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      
      // Image 1 from Sky, Image 2 from Sidharth. 
      // We'll put both in attachmentUrls to simulate the rich text/files attached.
      attachmentUrls: [
        "https://via.placeholder.com/800x600/333333/ffffff.png?text=Image+1+(CronJob)",
        "https://via.placeholder.com/800x600/1e40af/ffffff.png?text=Image+2+(PlayConsole)"
      ],
      
      // Response from Sidharth
      response: "yes i can, but can you see this",
      answeredAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection('questions').add(questionData);
    console.log('Simulated Q&A created with ID:', docRef.id);
    
    process.exit(0);
  } catch(err) {
    console.error(err);
    process.exit(1);
  }
}

simulateQA();
