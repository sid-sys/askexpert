import { adminDb, adminMessaging, FieldValue } from "@/lib/firebase-admin";

interface SendOptions {
  uid: string;          // recipient's Firebase UID
  title: string;
  body: string;
  link?: string;        // deep link to open on click
}

/**
 * sendPushNotification
 * Looks up user's FCM tokens from Firestore and sends a push message.
 * Silently skips if no tokens found (user hasn't enabled notifications).
 */
export async function sendPushNotification({ uid, title, body, link }: SendOptions) {
  try {
    const userDoc = await adminDb.collection("users").doc(uid).get();
    const tokens: string[] = userDoc.data()?.fcmTokens || [];

    if (!tokens.length) return; // user never enabled notifications

    const message = {
      notification: { title, body },
      data: link ? { link } : {} as Record<string, string>,
      tokens,
    };

    const response = await adminMessaging.sendEachForMulticast(message);

    // Clean up stale tokens
    const staleTokens: string[] = [];
    response.responses.forEach((r, i) => {
      if (!r.success && r.error?.code === "messaging/registration-token-not-registered") {
        staleTokens.push(tokens[i]);
      }
    });

    if (staleTokens.length) {
      const fresh = tokens.filter((t) => !staleTokens.includes(t));
      await adminDb.collection("users").doc(uid).update({ 
        fcmTokens: fresh,
        updatedAt: FieldValue.serverTimestamp()
      });
    }
  } catch (err) {
    // Non-fatal — don't break the main flow
    console.error("FCM send error:", err);
  }
}
