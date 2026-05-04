const Stripe = require('stripe');
require('dotenv').config({ path: '.env.local' });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function check() {
  try {
    const account = await stripe.accounts.retrieve('acct_1TQ6hBEavQ390NsI');
    console.log(JSON.stringify(account, null, 2));
  } catch (err) {
    console.error(err);
  }
}
check();
