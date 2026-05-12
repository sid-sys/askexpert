// Convert legacy "Monthly subscription" question docs into proper subscription
// docs. Pulls customer + subscription IDs from Stripe; resolves followerUid by
// matching followerEmail against the users collection. Deletes the question
// doc once the subscription doc is written.

require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');
const Stripe = require('stripe');
const serviceAccount = require('../firebase_apikey.json');

if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function findFollowerUid(email) {
  if (!email) return null;
  const snap = await db.collection('users').where('email', '==', email).limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0].id;
}

(async () => {
  const snap = await db.collection('questions').where('content', '==', 'Monthly subscription').get();
  console.log(`Found ${snap.size} legacy "Monthly subscription" question docs.`);

  for (const d of snap.docs) {
    const q = d.data();
    const sessionId = q.stripeSessionId;
    if (!sessionId) {
      console.log(`SKIP ${d.id}: no stripeSessionId`);
      continue;
    }

    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch (e) {
      console.log(`SKIP ${d.id}: stripe session not found (${e.message})`);
      continue;
    }

    if (session.mode !== 'subscription') {
      console.log(`SKIP ${d.id}: session is mode=${session.mode}`);
      continue;
    }

    const stripeSubscriptionId =
      typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;
    const stripeCustomerId =
      typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;

    if (!stripeSubscriptionId) {
      console.log(`SKIP ${d.id}: no subscription on the session`);
      continue;
    }

    const existing = await db
      .collection('subscriptions')
      .where('stripeSubscriptionId', '==', stripeSubscriptionId)
      .limit(1)
      .get();
    if (!existing.empty) {
      console.log(`SKIP ${d.id}: subscription doc already exists (${existing.docs[0].id})`);
      // Still clean up the orphan question
      await d.ref.delete();
      console.log(`  deleted orphan question ${d.id}`);
      continue;
    }

    const creatorSnap = await db.collection('users').doc(q.creatorId).get();
    const creatorData = creatorSnap.data() ?? {};

    const followerUid = q.followerUid || (await findFollowerUid(q.followerEmail));

    // Check Stripe subscription's current status
    let subStatus = 'active';
    let cancelledAt = null;
    try {
      const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      if (sub.status === 'canceled' || sub.status === 'incomplete_expired') {
        subStatus = 'cancelled';
        cancelledAt = sub.canceled_at ? new Date(sub.canceled_at * 1000) : null;
      }
    } catch (e) {
      console.log(`  could not fetch subscription status: ${e.message}`);
    }

    const docRef = await db.collection('subscriptions').add({
      creatorId: q.creatorId,
      creatorName: creatorData.displayName || q.creatorName || 'Creator',
      creatorUsername: creatorData.username || null,
      followerId: followerUid || null,
      followerEmail: q.followerEmail,
      followerName: q.followerName || null,
      status: subStatus,
      pricePerMonth: q.pricePaid || 0,
      currency: 'usd',
      stripeCustomerId,
      stripeSubscriptionId,
      stripeSessionId: sessionId,
      createdAt: q.createdAt || admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      cancelledAt,
      backfilled: true,
    });
    console.log(`OK  ${d.id} -> created subscription doc ${docRef.id} (status=${subStatus})`);

    if (followerUid && stripeCustomerId) {
      await db.collection('users').doc(followerUid).set(
        { stripeCustomerId, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
    }

    await d.ref.delete();
    console.log(`  deleted question ${d.id}`);
  }

  console.log('\nDone.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
