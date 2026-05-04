"use client";

import { useState } from "react";

interface PriceToggleProps {
  onToggle: (mode: "one-time" | "monthly") => void;
  defaultMode?: "one-time" | "monthly";
  oneTimePrice?: number;
  monthlyPrice?: number;
  currency?: string;
}

export default function PriceToggle({
  onToggle,
  defaultMode = "one-time",
  oneTimePrice,
  monthlyPrice,
  currency = "usd",
}: PriceToggleProps) {
  const [mode, setMode] = useState<"one-time" | "monthly">(defaultMode);

  const toggle = () => {
    const next = mode === "one-time" ? "monthly" : "one-time";
    setMode(next);
    onToggle(next);
  };

  const formatPrice = (cents: number) =>
    (cents / 100).toLocaleString("en-US", { 
      style: "currency", 
      currency: currency.toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        background: "#fafafa",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: "14px 20px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
      }}
    >
      {/* ONE-TIME LABEL */}
      <button
        onClick={() => { setMode("one-time"); onToggle("one-time"); }}
        style={{
          fontWeight: 800,
          fontSize: "0.85rem",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: mode === "one-time" ? "var(--orange)" : "var(--muted)",
          background: "none",
          border: "none",
          cursor: "pointer",
          transition: "color 0.2s",
        }}
      >
        {oneTimePrice ? `${formatPrice(oneTimePrice)} / Q` : "One-Time"}
      </button>

      {/* TOGGLE */}
      <div className="toggle-track" onClick={toggle} role="switch" aria-checked={mode === "monthly"}>
        <div className={`toggle-thumb ${mode === "monthly" ? "active" : ""}`} />
      </div>

      {/* MONTHLY LABEL */}
      <button
        onClick={() => { setMode("monthly"); onToggle("monthly"); }}
        style={{
          fontWeight: 800,
          fontSize: "0.85rem",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: mode === "monthly" ? "var(--green)" : "var(--muted)",
          background: "none",
          border: "none",
          cursor: "pointer",
          transition: "color 0.2s",
        }}
      >
        {monthlyPrice ? `${formatPrice(monthlyPrice)} / mo` : "Monthly"}
      </button>
    </div>
  );
}
