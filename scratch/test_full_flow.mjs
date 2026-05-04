
import { sendAskerConfirmationEmail } from "./lib/resend";
import fs from 'fs';
import path from 'path';

// Manual env loading
const envPath = path.resolve('.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w\.\-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.length > 0 && value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      }
      process.env[key] = value;
    }
  });
}

async function test() {
  console.log("🚀 Testing sendAskerConfirmationEmail...");
  try {
    const res = await sendAskerConfirmationEmail({
      to: "onboarding@resend.dev",
      creatorName: "Test Expert",
      question: "Why is this not working?",
      price: 500,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      currency: "usd",
    });
    console.log("🏁 Test finished. Result:", JSON.stringify(res));
  } catch (err) {
    console.error("💥 Test failed:", err);
  }
}

test();
