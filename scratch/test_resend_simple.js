const { Resend } = require('resend');
require('dotenv').config({ path: '.env.local' });

const resend = new Resend(process.env.RESEND_API_KEY);

async function testResend() {
  console.log('Testing Resend API with key:', process.env.RESEND_API_KEY ? 'Present' : 'Missing');
  try {
    const data = await resend.emails.send({
      from: process.env.RESEND_FROM || 'AskExpert <onboarding@resend.dev>',
      to: 'sidharthbabu9@gmail.com',
      subject: 'Test Notification',
      html: '<strong>Resend is working!</strong>',
    });

    console.log('Resend Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Resend Error:', error);
  }
}

testResend();
