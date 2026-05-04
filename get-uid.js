const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const lines = env.split('\n');
const getEnv = (key) => {
  const line = lines.find(l => l.startsWith(key + '='));
  return line ? line.substring(key.length + 1).replace(/^"|"$/g, '').replace(/\\n/g, '\n') : null;
};

const app = initializeApp({
  credential: cert({
    projectId: getEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
    clientEmail: getEnv('FIREBASE_CLIENT_EMAIL'),
    privateKey: getEnv('FIREBASE_PRIVATE_KEY')
  })
});

const db = getFirestore(app);
db.collection('users').where('username', '==', 'sid').get().then(snap => {
  if(snap.empty) console.log('not found');
  else console.log('UID:', snap.docs[0].id);
}).catch(console.error);
