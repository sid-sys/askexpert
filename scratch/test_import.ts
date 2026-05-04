import { adminDb } from "../lib/firebase-admin";

async function test() {
  console.log("Admin DB initialized:", !!adminDb);
  const snap = await adminDb.collection("questions").limit(1).get();
  console.log("Questions found:", snap.size);
  process.exit(0);
}

test().catch(console.error);
