
const admin = require('firebase-admin');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...rest] = line.split('=');
  if (key && rest.length) env[key.trim()] = rest.join('=').trim();
});

// Parse private key
const privateKey = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/"/g, '');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    }),
  });
}

const db = admin.firestore();

async function fixUser() {
  const uid = 'hCSrGtHMViYcIT2CfYRhqPk7AF32';
  console.log('Updating user:', uid);
  await db.collection('users').doc(uid).update({
    email: 'sidharthbabu9@gmail.com'
  });
  console.log('Done!');
}

fixUser().catch(console.error);
