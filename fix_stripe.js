const Stripe = require('stripe');
require('dotenv').config({ path: '.env.local' });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function fix() {
  const accountId = 'acct_1TQ6hBEavQ390NsI';
  try {
    console.log('Retrieving account...');
    const account = await stripe.accounts.retrieve(accountId);
    console.log('Current capabilities:', account.capabilities);
    
    console.log('Updating account to enable transfers...');
    await stripe.accounts.update(accountId, {
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    // In test mode, we can sometimes accept TOS via API
    await stripe.accounts.update(accountId, {
      tos_acceptance: {
        date: Math.floor(Date.now() / 1000),
        ip: '127.0.0.1',
      },
    });

    const updated = await stripe.accounts.retrieve(accountId);
    console.log('Updated capabilities:', updated.capabilities);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

fix();
