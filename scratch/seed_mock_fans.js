// Seeds mock subscription docs (and a starter message per chat) for sidharth
// so the /fans creator UI has multiple conversations to click through during
// testing. Idempotent: re-running won't create duplicates — it matches by
// stripeSubscriptionId prefix `mock_`.

const admin = require('firebase-admin');
const serviceAccount = require('../firebase_apikey.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const ts = admin.firestore.FieldValue.serverTimestamp;

const CREATOR_ID = 'hCSrGtHMViYcIT2CfYRhqPk7AF32'; // sidharth (@sid)
const CREATOR_NAME = 'sidharth';
const CREATOR_USERNAME = 'sid';

const FANS = [
  { name: 'Aarav Mehta',     email: 'aarav.mehta@example.com',     price:  500, daysAgo: 14, lastMsg: { from: 'fan', text: 'Hey Sid — loved the latest video!' } },
  { name: 'Priya Sharma',    email: 'priya.s@example.com',          price: 1000, daysAgo: 9,  lastMsg: { from: 'fan', text: 'Quick question about pricing for SaaS — got a minute?' } },
  { name: 'Daniel Cohen',    email: 'd.cohen@example.com',          price: 1000, daysAgo: 6,  lastMsg: { from: 'creator', text: 'Sure — I usually go with usage-based + a flat starter tier.' } },
  { name: 'Mei Lin',         email: 'mei.lin@example.com',          price: 1500, daysAgo: 4,  lastMsg: { from: 'fan', text: 'How do you stay consistent shipping every week?' } },
  { name: 'Lukas Becker',    email: 'lukas.becker@example.com',     price: 1000, daysAgo: 3,  lastMsg: { from: 'creator', text: 'Time-box it. 90 min Sunday for the week ahead.' } },
  { name: 'Sofia Romero',    email: 'sofia.r@example.com',          price:  500, daysAgo: 2,  lastMsg: { from: 'fan', text: 'Just subscribed 🎉 excited to learn from you!' } },
  { name: 'Noah Williams',   email: 'noah.w@example.com',           price: 2000, daysAgo: 1,  lastMsg: { from: 'fan', text: 'Any advice on first-time fundraising?' } },
  { name: 'Hana Kobayashi',  email: 'hana.k@example.com',           price: 1000, daysAgo: 0.5, lastMsg: { from: 'creator', text: 'Welcome aboard, Hana! Drop a question whenever.' } },

  // ── Second batch ───────────────────────────────────────────────────────
  { name: 'Isabella Rossi',   email: 'isabella.r@example.com',       price: 1000, daysAgo: 32, lastMsg: { from: 'fan',     text: 'Coffee chat sometime next week?' } },
  { name: 'Marcus Johnson',   email: 'marcus.j@example.com',         price:  500, daysAgo: 28, lastMsg: { from: 'creator', text: 'Glad it helped! Ping me if you hit issues.' } },
  { name: 'Yuki Tanaka',      email: 'yuki.tanaka@example.com',      price: 1500, daysAgo: 25, lastMsg: { from: 'fan',     text: 'Reviewing your last reply — really clarifying, thanks 🙏' } },
  { name: 'Olivia Brown',     email: 'olivia.b@example.com',         price: 1000, daysAgo: 22, lastMsg: { from: 'fan',     text: 'Did you ever try Notion for client briefs?' } },
  { name: 'Rajesh Iyer',      email: 'rajesh.iyer@example.com',      price: 2500, daysAgo: 20, lastMsg: { from: 'creator', text: 'I usually skip Notion for that — clients prefer email.' } },
  { name: 'Emma Davies',      email: 'emma.davies@example.com',      price: 1000, daysAgo: 18, lastMsg: { from: 'fan',     text: 'How long did your first MVP take?' } },
  { name: 'Tomás García',     email: 'tomas.g@example.com',          price:  500, daysAgo: 17, lastMsg: { from: 'fan',     text: 'Sharing my landing page draft — would love feedback when free.' } },
  { name: 'Anika Patel',      email: 'anika.patel@example.com',      price: 1500, daysAgo: 15, lastMsg: { from: 'creator', text: 'Tightened the hero copy — try a one-liner above the fold.' } },
  { name: 'Leon Schmidt',     email: 'leon.schmidt@example.com',     price: 1000, daysAgo: 13, lastMsg: { from: 'fan',     text: 'What stack did you use for the dashboard?' } },
  { name: 'Maya Goldberg',    email: 'maya.g@example.com',           price: 2000, daysAgo: 11, lastMsg: { from: 'fan',     text: 'Just bumped to the higher tier — ready for the next call' } },
  { name: 'Ethan O\'Brien',   email: 'ethan.obrien@example.com',     price:  500, daysAgo: 10, lastMsg: { from: 'creator', text: 'Awesome. Let\'s do Thursday 4pm your time?' } },
  { name: 'Wei Chen',         email: 'wei.chen@example.com',         price: 1000, daysAgo:  8, lastMsg: { from: 'fan',     text: 'Have you written about churn for sub products?' } },
  { name: 'Camila Vargas',    email: 'camila.v@example.com',         price: 1000, daysAgo:  7, lastMsg: { from: 'creator', text: 'Not yet — happy to record a quick voice note on it.' } },
  { name: 'Ahmed El-Sayed',   email: 'ahmed.elsayed@example.com',    price: 1500, daysAgo:  5, lastMsg: { from: 'fan',     text: 'Loved the voice note 🔥 sending follow-up questions.' } },
  { name: 'Nina Volkov',      email: 'nina.v@example.com',           price:  500, daysAgo:  4, lastMsg: { from: 'fan',     text: 'Tax setup question — got 5 min?' } },
  { name: 'Jamal Carter',     email: 'jamal.carter@example.com',     price: 1000, daysAgo:  3, lastMsg: { from: 'creator', text: 'Yes, sending a quick checklist over.' } },
  { name: 'Astrid Lindgren',  email: 'astrid.l@example.com',         price: 2000, daysAgo:  3, lastMsg: { from: 'fan',     text: 'Got the checklist, super useful, on it tonight.' } },
  { name: 'Pedro Almeida',    email: 'pedro.almeida@example.com',    price: 1000, daysAgo:  2, lastMsg: { from: 'fan',     text: 'Renewed for another month, see you at office hours!' } },
  { name: 'Riya Kapoor',      email: 'riya.kapoor@example.com',      price:  500, daysAgo:  2, lastMsg: { from: 'fan',     text: 'Brief intro — I run a small design studio in Bangalore.' } },
  { name: 'Henrik Olsen',     email: 'henrik.olsen@example.com',     price: 1500, daysAgo:  1, lastMsg: { from: 'creator', text: 'Nice to meet you Henrik — drop your studio link when you can.' } },
  { name: 'Zoe Anderson',     email: 'zoe.anderson@example.com',     price: 2500, daysAgo:  0.3, lastMsg: { from: 'fan',   text: 'Just subscribed 👋 looking forward to the chats!' } },
];

(async () => {
  let created = 0, skipped = 0;
  for (const fan of FANS) {
    const stripeSubscriptionId = `mock_${fan.email.replace(/[^a-z0-9]/g, '_')}`;
    const existing = await db.collection('subscriptions')
      .where('stripeSubscriptionId', '==', stripeSubscriptionId)
      .limit(1).get();
    if (!existing.empty) {
      skipped++;
      continue;
    }

    const subCreatedAt = new Date(Date.now() - fan.daysAgo * 86_400_000);

    // Mock follower UID. Real fans have a Firebase Auth uid, but mocks don't
    // need one — they just need to display.
    const followerId = `mock_uid_${fan.email.replace(/[^a-z0-9]/g, '_').slice(0, 28)}`;

    const subRef = await db.collection('subscriptions').add({
      creatorId: CREATOR_ID,
      creatorName: CREATOR_NAME,
      creatorUsername: CREATOR_USERNAME,
      followerId,
      followerEmail: fan.email,
      followerName: fan.name,
      status: 'active',
      pricePerMonth: fan.price,
      currency: 'usd',
      stripeCustomerId: null,
      stripeSubscriptionId,
      stripeSessionId: null,
      createdAt: admin.firestore.Timestamp.fromDate(subCreatedAt),
      updatedAt: ts(),
      cancelledAt: null,
      mock: true,
    });

    // Seed a couple of messages so the conversation list row has a real
    // "last message" preview and the thread isn't empty when clicked.
    const messagesRef = subRef.collection('messages');
    const greetingAt = new Date(subCreatedAt.getTime() + 60_000);
    await messagesRef.add({
      creatorId: CREATOR_ID,
      followerId,
      senderId: followerId,
      senderRole: 'fan',
      text: `Hi ${CREATOR_NAME}! Just subscribed — looking forward to learning from you.`,
      attachments: [],
      createdAt: admin.firestore.Timestamp.fromDate(greetingAt),
    });

    const lastAt = new Date(Date.now() - Math.max(60_000, fan.daysAgo * 0.4 * 86_400_000));
    await messagesRef.add({
      creatorId: CREATOR_ID,
      followerId,
      senderId: fan.lastMsg.from === 'creator' ? CREATOR_ID : followerId,
      senderRole: fan.lastMsg.from, // "creator" | "fan"
      text: fan.lastMsg.text,
      attachments: [],
      createdAt: admin.firestore.Timestamp.fromDate(lastAt),
    });

    created++;
    console.log(`+ ${fan.name} <${fan.email}>  $${(fan.price / 100).toFixed(2)}/mo  (${fan.daysAgo}d ago)`);
  }

  console.log(`\nDone. Created ${created} mock fans, skipped ${skipped} already present.`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
