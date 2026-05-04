
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from 'fs';
import path from 'path';

// I'll just copy the logic since importing from lib/resend.js is hard in a scratch script
import { Resend } from "resend";

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

async function run() {
  const qId = "jHeLXgtElIkpuZaPKaQx";
  console.log(`🔍 Checking question ${qId}...`);
  const qSnap = await db.collection("questions").doc(qId).get();
  if (!qSnap.exists) {
    console.log("Not found.");
    return;
  }
  const q = qSnap.data();
  console.log("Question found:", q.content);

  const creatorSnap = await db.collection("users").doc(q.creatorId).get();
  const creator = creatorSnap.data();
  console.log("Creator found:", creator?.displayName, creator?.email);

  if (!creator?.email) {
    console.log("❌ Creator has no email!");
  }

  console.log("📧 Attempting to send asker confirmation...");
  try {
    const res1 = await resend.emails.send({
        from: FROM,
        to: q.followerEmail,
        subject: `✅ Question submitted to ${creator?.displayName || "Expert"}`,
        html: `<p>Question: ${q.content}</p>`,
    });
    console.log("Asker result:", res1);
  } catch (e) {
    console.error("Asker fail:", e);
  }

  if (creator?.email) {
    console.log("📧 Attempting to send creator notification...");
    try {
        const res2 = await resend.emails.send({
            from: FROM,
            to: creator.email,
            subject: `💬 New question from ${q.followerEmail}`,
            html: `<p>Question: ${q.content}</p>`,
        });
        console.log("Creator result:", res2);
    } catch (e) {
        console.error("Creator fail:", e);
    }
  }
}

run();
