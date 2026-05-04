
import { Resend } from "resend";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
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

const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const app = initializeApp({
  credential: cert({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey,
  }),
});
const db = getFirestore(app);
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM || "AskExpert <noreply@askexpert.ink>";

async function logNotification(data) {
  try {
    await db.collection("notificationAudit").add({
      ...data,
      timestamp: FieldValue.serverTimestamp(),
      env: "test-script",
    });
    console.log("📝 Audit logged.");
  } catch (err) {
    console.error("❌ Failed to log notification audit:", err);
  }
}

async function test() {
  const to = "onboarding@resend.dev";
  console.log(`📧 Sending test email to ${to}...`);
  
  try {
    const res = await resend.emails.send({
      from: FROM,
      to,
      subject: "Test Logging",
      html: "<p>Test</p>",
    });

    if (res.error) {
      console.error("❌ Resend error:", res.error);
      await logNotification({ to, subject: "Test Logging", type: "test", status: "error", error: res.error });
    } else {
      console.log("✅ Resend success:", res.data?.id);
      await logNotification({ to, subject: "Test Logging", type: "test", status: "success", metadata: { resendId: res.data?.id } });
    }
  } catch (err) {
    console.error("💥 Crash:", err);
  }
}

test();
