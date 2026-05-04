"use client";

import { useState, useRef } from "react";
import { createPopper } from "@popperjs/core";

interface TooltipProps {
  children: React.ReactNode;
  content: string;
  placement?: "top" | "bottom" | "left" | "right";
  disabled?: boolean;
}

export default function Tooltip({ children, content, placement = "right", disabled = false }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const referenceRef = useRef<HTMLDivElement>(null);
  const popperRef = useRef<HTMLDivElement>(null);
  const popperInstanceRef = useRef<any>(null);

  const show = () => {
    if (disabled) return;
    setVisible(true);
    if (referenceRef.current && popperRef.current) {
      popperInstanceRef.current = createPopper(referenceRef.current, popperRef.current, {
        placement,
        modifiers: [
          { name: "offset", options: { offset: [0, 8] } },
          { name: "preventOverflow", options: { padding: 8 } }
        ],
      });
    }
  };

  const hide = () => {
    setVisible(false);
    if (popperInstanceRef.current) {
      popperInstanceRef.current.destroy();
      popperInstanceRef.current = null;
    }
  };

  return (
    <>
      <div
        ref={referenceRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        style={{ display: "flex", width: "100%", justifyContent: "center" }}
      >
        {children}
      </div>
      
      {visible && !disabled && (
        <div
          ref={popperRef}
          style={{
            background: "#1f2937",
            color: "#fff",
            padding: "6px 10px",
            borderRadius: "6px",
            fontSize: "0.75rem",
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
            zIndex: 9999,
            pointerEvents: "none",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            whiteSpace: "nowrap"
          }}
        >
          {content}
        </div>
      )}
    </>
  );
}
