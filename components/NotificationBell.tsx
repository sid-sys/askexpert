"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { requestNotificationPermission, onForegroundMessage } from "@/lib/fcm";

interface Toast {
  id: number;
  title: string;
  body: string;
}

export default function NotificationBell() {
  const { user } = useAuth();
  const [permitted, setPermitted] = useState<boolean | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [saving, setSaving] = useState(false);

  // On mount, check existing permission
  useEffect(() => {
    if (typeof window !== "undefined") {
      setPermitted(Notification.permission === "granted");
    }
  }, []);

  // Listen for foreground messages
  useEffect(() => {
    const unsub = onForegroundMessage((payload) => {
      const { title = "AskExpert", body = "" } = payload.notification || {};
      const id = Date.now();
      setToasts((prev) => [...prev, { id, title, body }]);
      // Auto-dismiss after 5s
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
    });
    return unsub;
  }, []);

  const handleEnable = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const token = await requestNotificationPermission();
      if (!token) { setSaving(false); return; }

      const idToken = await user.getIdToken();
      await fetch("/api/fcm/save-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ token }),
      });
      setPermitted(true);
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  return (
    <>
      {/* BELL BUTTON */}
      {permitted === false && (
        <button
          onClick={handleEnable}
          disabled={saving}
          title="Enable push notifications"
          style={{
            background: "var(--dark)",
            border: "2px solid var(--orange)",
            boxShadow: "3px 3px 0 var(--orange)",
            color: "var(--orange)",
            padding: "6px 14px",
            cursor: "pointer",
            fontFamily: "Space Grotesk",
            fontWeight: 700,
            fontSize: "0.8rem",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            display: "flex",
            alignItems: "center",
            gap: 6,
            transition: "transform 0.1s, box-shadow 0.1s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "translate(-2px,-2px)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "5px 5px 0 var(--orange)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "3px 3px 0 var(--orange)";
          }}
        >
          {saving ? "⏳" : "🔔"} {saving ? "Enabling..." : "Enable Alerts"}
        </button>
      )}

      {permitted === true && (
        <div title="Notifications enabled" style={{ fontSize: "1.3rem" }}>🔔</div>
      )}

      {/* FOREGROUND TOAST STACK */}
      <div style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            className="card-brutal card-brutal-purple animate__animated animate__slideInRight"
            style={{ maxWidth: 320, padding: "14px 18px" }}
          >
            <div style={{ fontWeight: 800, color: "var(--purple)", marginBottom: 4 }}>🔔 {t.title}</div>
            <div style={{ color: "var(--muted)", fontSize: "0.88rem" }}>{t.body}</div>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              style={{ position: "absolute", top: 8, right: 12, background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "1rem" }}
            >✕</button>
          </div>
        ))}
      </div>
    </>
  );
}
