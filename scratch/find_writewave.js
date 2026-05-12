const admin = require('firebase-admin');
const serviceAccount = require('../firebase_apikey.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

(async () => {
  // Search Firebase Auth users for writewaveai email
  const result = await admin.auth().getUserByEmail('writewaveai@gmail.com').catch(() => null);
  if (!result) {
    console.log('No Firebase Auth user with email writewaveai@gmail.com');
    // List all auth users
    const list = await admin.auth().listUsers(20);
    console.log(`Listing ${list.users.length} auth users:`);
    list.users.forEach((u) => console.log(`  ${u.uid}  ${u.email}  ${u.displayName}`));
  } else {
    console.log('Found:');
    console.log(`  uid=${result.uid}`);
    console.log(`  email=${result.email}`);
    console.log(`  displayName=${result.displayName}`);
    console.log(`  emailVerified=${result.emailVerified}`);
    console.log(`  providers=${result.providerData.map((p) => p.providerId).join(', ')}`);
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
