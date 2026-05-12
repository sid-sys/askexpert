const admin = require('firebase-admin');
const serviceAccount = require('../firebase_apikey.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  const uid = 'zTHGz5s5mdVqLZcMPzcBlzNzX4Y2';
  const email = 'writewaveai@gmail.com';

  // 1. Patch the user doc with email + displayName from Auth
  const authUser = await admin.auth().getUser(uid);
  await db.collection('users').doc(uid).set({
    uid,
    email: authUser.email,
    displayName: authUser.displayName || 'Fan',
    photoURL: authUser.photoURL || '',
    isAdmin: false,
    isCreator: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log(`Patched user doc ${uid}`);

  // 2. Link orphan subscription to this UID
  const subs = await db
    .collection('subscriptions')
    .where('followerEmail', '==', email)
    .where('followerId', '==', null)
    .get();
  for (const d of subs.docs) {
    await d.ref.update({ followerId: uid, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    console.log(`Linked subscription ${d.id} -> followerId=${uid}`);
  }

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
