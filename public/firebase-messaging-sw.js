// Firebase Cloud Messaging Service Worker
// Place this file in /public so it's served at /firebase-messaging-sw.js

importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// These values are safe to expose — they only allow sending, not admin access
firebase.initializeApp({
  apiKey: self.FIREBASE_API_KEY || "REPLACE_WITH_NEXT_PUBLIC_FIREBASE_API_KEY",
  authDomain: self.FIREBASE_AUTH_DOMAIN || "REPLACE_WITH_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  projectId: self.FIREBASE_PROJECT_ID || "REPLACE_WITH_NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  storageBucket: self.FIREBASE_STORAGE_BUCKET || "REPLACE_WITH_NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: self.FIREBASE_MESSAGING_SENDER_ID || "REPLACE_WITH_NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  appId: self.FIREBASE_APP_ID || "REPLACE_WITH_NEXT_PUBLIC_FIREBASE_APP_ID",
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message received:', payload);
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title || 'AskExpert', {
    body: body || 'You have a new notification',
    icon: icon || '/icon-192.png',
    badge: '/icon-192.png',
    data: payload.data,
    actions: [{ action: 'open', title: 'Open Dashboard' }],
  });
});

// Notification click → open dashboard
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/dashboard')
  );
});
