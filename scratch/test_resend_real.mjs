
import { Resend } from "resend";
import admin from "firebase-admin";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// Initialize Firebase for auditing
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const adminDb = admin.firestore();

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM || "AskExpert <noreply@askexpert.ink>";

async function test() {
  const to = "sidharthbabu9@gmail.com";
  console.log(`🚀 Sending test email to ${to} from ${FROM}...`);
  
  try {
    const res = await resend.emails.send({
      from: FROM,
      to,
      subject: "Test Email from AskExpert",
      html: "<h1>Test</h1><p>This is a manual test of the Resend configuration.</p>"
    });
    
    if (res.error) {
      console.error("❌ Resend Error:", JSON.stringify(res.error, null, 2));
    } else {
      console.log("✅ Resend Success! Email ID:", res.data?.id);
    }
  } catch (e) {
    console.error("💥 Exception:", e);
  }
}

test();
