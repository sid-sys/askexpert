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

    // 1. Initial online status
    const updatePresence = async (status: boolean) => {
      try {
        const userRef = doc(db, COLLECTIONS.USERS, user.uid);
        await setDoc(userRef, {
          isOnline: status,
          lastSeen: serverTimestamp(),
        }, { merge: true });
      } catch (err) {
        console.error("Presence update failed:", err);
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
      updatePresence(false);
    };
  }, [user]);

  return null; // Invisible component
}
