const Stripe = require('stripe');
require('dotenv').config({ path: '.env.local' });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function testCheckout() {
  const creatorId = 'hCSrGtHMViYcIT2CfYRhqPk7AF32'; // sid
  const stripeAccountId = 'acct_1TQ6hBEavQ390NsI';
  
  try {
    console.log('Creating test checkout session for sid...');
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: 'Test Payout Question' },
          unit_amount: 5000, // $50.00
        },
        quantity: 1,
      }],
      success_url: 'http://localhost:3000/success',
      cancel_url: 'http://localhost:3000/cancel',
      payment_intent_data: {
        application_fee_amount: 750, // 15% fee
        transfer_data: { destination: stripeAccountId },
      },
    });
    console.log('Session URL:', session.url);
    console.log('SUCCESS: Stripe Connect payout configuration is valid for this account.');
  } catch (err) {
    console.error('FAILURE:', err.message);
    if (err.message.includes('not active') || err.message.includes('requirements')) {
      console.log('HINT: The creator needs to complete Stripe onboarding or verify their identity.');
    }
  }
}

testCheckout();
