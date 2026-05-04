const { adminDb, FieldValue } = require('./lib/firebase-admin');

async function createTestExpired() {
  console.log("🧪 Creating a test expired question...");
  
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() - 10); // 10 minutes ago
  
  const testQuestion = {
    content: "This is a TEST question for local cron testing.",
    status: "PENDING",
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: expiresAt,
    followerEmail: "sidharth@example.com", // Change this to your email to test the notification!
    creatorId: "test_creator_123",
    creatorName: "Test Expert",
    stripePaymentIntentId: "pi_test_12345", // Mock ID
    amount: 1000,
  };

  const docRef = await adminDb.collection("questions").add(testQuestion);
  console.log(`✅ Test question created! ID: ${docRef.id}`);
  console.log(`⏰ It expired at: ${expiresAt.toISOString()}`);
  console.log(`\nNow run the curl command to trigger the refund!`);
}

createTestExpired().catch(console.error);
