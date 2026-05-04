
import { Resend } from "resend";
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

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM || "AskExpert <noreply@askexpert.ink>";

async function test() {
  console.log(`Using API Key: ${process.env.RESEND_API_KEY ? "EXISTS" : "MISSING"}`);
  console.log(`From: ${FROM}`);
  
  try {
    const res = await resend.emails.send({
      from: FROM,
      to: "onboarding@resend.dev",
      subject: "Test Email from Diagnostic Script",
      html: "<h1>Test</h1><p>If you see this, Resend is working.</p>",
    });

    if (res.error) {
      console.error("❌ Resend Error:", JSON.stringify(res.error, null, 2));
    } else {
      console.log("✅ Resend Success:", res.data);
    }
  } catch (err) {
    console.error("💥 Crash:", err);
  }
}

test();
