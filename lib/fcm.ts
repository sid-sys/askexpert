import { getMessaging, getToken, onMessage, Messaging } from "firebase/messaging";
import app from "./firebase";

let messagingInstance: Messaging | null = null;

export function getMessagingInstance(): Messaging | null {
  if (typeof window === "undefined") return null;
  if (!messagingInstance) {
    messagingInstance = getMessaging(app);
  }
  return messagingInstance;
}

/**
 * Request notification permission and get FCM token.
 * Returns the token string or null if denied.
 */
export async function requestNotificationPermission(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("Notification permission denied");
      return null;
    }

    // Ensure service worker is registered
    const swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

    const messaging = getMessagingInstance();
    if (!messaging) return null;

    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: swReg,
    });

    return token || null;
  } catch (err) {
    console.error("FCM token error:", err);
    return null;
  }
}

/**
 * Listen for foreground messages (app is open).
 * Returns an unsubscribe function.
 */
export function onForegroundMessage(
  callback: (payload: { notification?: { title?: string; body?: string } }) => void
): () => void {
  const messaging = getMessagingInstance();
  if (!messaging) return () => {};
  return onMessage(messaging, callback);
}
