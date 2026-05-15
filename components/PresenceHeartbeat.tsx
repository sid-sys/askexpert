"use client";

import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/types";

export default function PresenceHeartbeat() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    // 1. Initial online status. We swallow permission-denied silently
    // because the cleanup write below races with sign-out: by the time we
    // try to flip isOnline:false, Firebase has already invalidated the
    // token, so the write 403s. That's expected — the user is leaving
    // anyway, the heartbeat will time out their presence naturally.
    let signedOutFlag = false;
    const updatePresence = async (status: boolean) => {
      if (signedOutFlag) return;
      try {
        const userRef = doc(db, COLLECTIONS.USERS, user.uid);
        await setDoc(userRef, {
          isOnline: status,
          lastSeen: serverTimestamp(),
        }, { merge: true });
      } catch (err: any) {
        // permission-denied during sign-out is expected; anything else is
        // a real issue worth logging.
        if (err?.code !== "permission-denied") {
          console.error("Presence update failed:", err);
        }
      }
    };

    updatePresence(true);

    // 2. Heartbeat every 2 minutes
    const interval = setInterval(() => {
      updatePresence(true);
    }, 120000); 

    // 3. Cleanup: Set offline when leaving
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        updatePresence(false);
      } else {
        updatePresence(true);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      // Flag is checked inside updatePresence so the cleanup write itself
      // becomes a no-op. The token's about to be invalidated and the doc
      // will go stale naturally via the heartbeat timeout.
      signedOutFlag = true;
    };
  }, [user]);

  return null; // Invisible component
}
