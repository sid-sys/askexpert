const admin = require('firebase-admin');
const serviceAccount = require('../firebase_apikey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'askexpert-app.firebasestorage.app',
  });
}

(async () => {
  const bucket = admin.storage().bucket();
  const [files] = await bucket.getFiles({ prefix: 'asker_attachments/' });
  console.log(`Found ${files.length} files in asker_attachments/`);
  for (const f of files) {
    console.log(`- ${f.name}  size=${f.metadata.size}  created=${f.metadata.timeCreated}`);
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
