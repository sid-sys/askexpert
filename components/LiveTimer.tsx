"use client";

import { useState, useEffect } from "react";

interface LiveTimerProps {
  expiresAt: any;
  status: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function LiveTimer({ expiresAt, status, className, style }: LiveTimerProps) {
  const [timeLeft, setTimeLeft] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    if (status !== "PENDING") return;
    
    const update = () => {
      if (!expiresAt) return;
      
      // Handle Firestore Timestamp or ISO string
      const d = expiresAt?.toDate ? expiresAt.toDate() : new Date(expiresAt);
      const diff = d.getTime() - Date.now();
      
      if (diff <= 0) {
        setTimeLeft("Expired");
        setIsUrgent(true);
        return;
      }
      
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      
      if (h >= 24) {
        const days = Math.floor(h / 24);
        setTimeLeft(`${days}d ${h % 24}h left`);
        setIsUrgent(false);
      } else {
        setTimeLeft(`${h}h ${m}m ${s}s left`);
        setIsUrgent(h < 12); // Urgent if less than 12h
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, status]);

  if (status !== "PENDING" || !timeLeft) return null;

  return (
    <span 
      className={className}
      style={{ 
        color: isUrgent ? "#ef4444" : "#f59e0b", 
        fontSize: "0.75rem", 
        fontWeight: 700,
        background: isUrgent ? "#fef2f2" : "#fffbeb",
        padding: "2px 8px",
        borderRadius: 99,
        fontVariantNumeric: "tabular-nums",
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        ...style
      }}
    >
      ⏱ {timeLeft}
    </span>
  );
}
