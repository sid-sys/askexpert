require('dotenv').config({ path: '.env.local' });
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

(async () => {
  const sessionId = 'cs_test_a1BHzHjCF1Q2Ug90XhsxWByebniovE4M3xVJ1MI8wOn419T1QYDRQSwLUV';
  const s = await stripe.checkout.sessions.retrieve(sessionId);
  console.log('Session metadata:');
  console.log(JSON.stringify(s.metadata, null, 2));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
