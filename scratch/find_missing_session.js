const Stripe = require('stripe');
const stripe = new Stripe('sk_test_51TH41fEw4pLuSFgr972N1KwejZS9AGp466JG29z6BvVIBhUnRFAhpaxRXWSp4Q1TET3u3MLqkPXfvl8cx3IZictg00vazAknDv');

async function findSession() {
    const sessions = await stripe.checkout.sessions.list({ limit: 5 });
    sessions.data.forEach(session => {
        console.log('---');
        console.log('ID:', session.id);
        console.log('Payment Status:', session.payment_status);
        console.log('Metadata:', session.metadata);
        console.log('Amount:', session.amount_total);
        console.log('Customer Email:', session.customer_details?.email);
    });
}

findSession().catch(console.error);
