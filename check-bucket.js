const { initializeApp, cert } = require('firebase-admin/app');
const { getStorage } = require('firebase-admin/storage');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const lines = env.split('\n');
const getEnv = (key) => {
  const line = lines.find(l => l.startsWith(key + '='));
  return line ? line.substring(key.length + 1).replace(/^"|"$/g, '').replace(/\\n/g, '\n').trim() : null;
};

const app = initializeApp({
  credential: cert({
    projectId: getEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
    clientEmail: getEnv('FIREBASE_CLIENT_EMAIL'),
    privateKey: getEnv('FIREBASE_PRIVATE_KEY')
  })
});

const storage = getStorage(app);
storage.bucket('askexpert-app.appspot.com').exists().then(exists => console.log('askexpert-app.appspot.com exists:', exists[0])).catch(e => console.log('Error 1:', e.message));
storage.bucket('askexpert-app.firebasestorage.app').exists().then(exists => console.log('askexpert-app.firebasestorage.app exists:', exists[0])).catch(e => console.log('Error 2:', e.message));
