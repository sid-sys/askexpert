"use client";

import React, { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { gsap } from "gsap";
import Swal from "sweetalert2";

type Tab = "feedback" | "bug";

const isValidEmail = (email: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

// Routes where the floating trigger would visually crowd the page. The panel
// itself can still be opened from those routes via the `open-feedback` window
// event (the BottomNav profile sheet dispatches it on mobile).
const HIDDEN_ON = ["/fans", "/fan-dashboard"];

export default function FeedbackButton() {
  const pathname = usePathname();

  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("feedback");
  const [submitting, setSubmitting] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Hide on chat-heavy routes. Done before any other hooks-after-conditional
  // would matter — hooks below stay declared so React's rules still hold.
  const hide = !!pathname && HIDDEN_ON.some(r => pathname === r || pathname.startsWith(r + "/"));

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 900);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    const handleOpenFeedback = () => setOpen(true);
    window.addEventListener('open-feedback', handleOpenFeedback);
    return () => window.removeEventListener('open-feedback', handleOpenFeedback);
  }, []);

  // Feedback State
  const [fbName, setFbName] = useState("");
  const [fbEmail, setFbEmail] = useState("");
  const [fbMessage, setFbMessage] = useState("");

  // Bug State
  const [bugName, setBugName] = useState("");
  const [bugEmail, setBugEmail] = useState("");
  const [bugMessage, setBugMessage] = useState("");

  const handleToggle = () => {
    if (!open) {
      setOpen(true);
    } else {
      SwapClose();
    }
  };

  const SwapClose = () => {
    if (panelRef.current) {
      gsap.to(panelRef.current, {
        opacity: 0,
        y: 40,
        scale: 0.95,
        duration: 0.25,
        ease: "power2.in",
        onComplete: () => {
          setOpen(false);
        },
      });
    } else {
      setOpen(false);
    }
  };

  const resetForms = () => {
    setFbName(""); setFbEmail(""); setFbMessage("");
    setBugName(""); setBugEmail(""); setBugMessage("");
  };

  const handleSubmit = async () => {
    const email = tab === "feedback" ? fbEmail : bugEmail;
    const name = tab === "feedback" ? fbName : bugName;
    const message = tab === "feedback" ? fbMessage : bugMessage;

    if (!message.trim()) {
      Swal.fire({ icon: "warning", title: "Message Required", text: "Please tell us more before sending.", confirmButtonColor: "#7c3aed" });
      return;
    }

    if (!email.trim()) {
      Swal.fire({ icon: "warning", title: "Email Required", text: "Please enter your email so we can follow up.", confirmButtonColor: "#7c3aed" });
      return;
    }

    if (!isValidEmail(email)) {
      Swal.fire({ icon: "warning", title: "Invalid Email", text: "Please enter a valid email address.", confirmButtonColor: "#7c3aed" });
      return;
    }

    setSubmitting(true);
    try {
      console.log("Submitting feedback...", { tab, name, email });
      
      const response = await fetch(`/api/feedback?t=${Date.now()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: tab,
          name: name || "Anonymous",
          email,
          message,
          url: window.location.pathname,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Server failed");
      }

      // Success!
      resetForms();
      
      // Close the panel immediately so it doesn't hang around behind the SweetAlert
      SwapClose();

      Swal.fire({
        icon: "success",
        title: tab === "feedback" ? "Feedback Sent! 🙏" : "Bug Reported! 🐛",
        text: "Thank you for helping us improve AskExpert.",
        timer: 3000,
        showConfirmButton: true,
        confirmButtonColor: "#7c3aed",
      });

    } catch (error: any) {
      console.error("Submission failed details:", error);
      Swal.fire({
        icon: "error",
        title: "Submission Error",
        text: error.message || "We couldn't send your feedback. Please check your connection or try again later.",
        confirmButtonColor: "#7c3aed",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Animations on open
  useEffect(() => {
    if (open && panelRef.current) {
      gsap.fromTo(panelRef.current, 
        { opacity: 0, y: 40, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "power3.out" }
      );
    }
  }, [open]);

  // ── Styles ────────────────────────────────────────────────────────────────
  const S = {
    wrap: {
      position: "fixed",
      // Use a CSS custom property so the mobile bottom-nav CSS can override without
      // any window checks here (avoids the SSR ↔ client hydration mismatch).
      bottom: isMobile ? 84 : 28,
      right: isMobile ? 16 : 28,
      zIndex: 100001,
      display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12,
      maxWidth: "calc(100vw - 32px)",
    } as React.CSSProperties,

    triggerBtn: {
      display: "flex", alignItems: "center", gap: 10,
      padding: "14px 24px", borderRadius: "99px",
      background: "linear-gradient(135deg, #7c3aed, #9333ea)",
      color: "#fff", border: "none", cursor: "pointer",
      fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: "0.95rem",
      boxShadow: "0 8px 20px rgba(124, 58, 237, 0.3)",
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    } as React.CSSProperties,

    panel: {
      width: 380, maxWidth: "100%", background: "rgba(255, 255, 255, 0.95)",
      backdropFilter: "blur(12px)", borderRadius: 24, overflow: "hidden",
      boxShadow: "0 20px 50px rgba(0,0,0,0.15)", border: "1px solid rgba(255,255,255,0.2)",
      display: "flex", flexDirection: "column",
    } as React.CSSProperties,

    panelHeader: {
      padding: "16px 24px", background: "linear-gradient(135deg, #7c3aed, #9333ea)",
      color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center",
    } as React.CSSProperties,

    panelTitle: { margin: 0, fontSize: "1.1rem", fontWeight: 800, fontFamily: "'Outfit', sans-serif" },

    closeBtn: {
      background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "50%",
      width: 30, height: 30, color: "#fff", cursor: "pointer",
      fontSize: "0.9rem", display: "flex", alignItems: "center", justifyContent: "center",
    } as React.CSSProperties,

    tabs: { display: "flex", borderBottom: "1px solid #f3f4f6" } as React.CSSProperties,

    tabBtn: (active: boolean): React.CSSProperties => ({
      flex: 1, padding: "12px 0", border: "none", cursor: "pointer",
      fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: "0.85rem",
      background: active ? "#f5f3ff" : "transparent",
      color: active ? "#7c3aed" : "#9ca3af",
      borderBottom: active ? "3px solid #7c3aed" : "3px solid transparent",
      transition: "all 0.2s ease",
    }),

    body: { padding: "20px 24px" } as React.CSSProperties,

    label: {
      display: "block", fontSize: "0.7rem", fontWeight: 800,
      color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: "0.05em",
      marginBottom: 4,
    } as React.CSSProperties,

    input: {
      width: "100%", padding: "12px 14px", borderRadius: 12,
      border: "1.5px solid #e5e7eb", fontFamily: "'Inter', sans-serif",
      fontSize: "0.9rem", color: "#1f2937", outline: "none",
      boxSizing: "border-box" as const, transition: "all 0.2s",
    } as React.CSSProperties,

    textarea: {
      width: "100%", padding: "12px 14px", borderRadius: 12,
      border: "1.5px solid #e5e7eb", fontFamily: "'Inter', sans-serif",
      fontSize: "0.9rem", color: "#1f2937", outline: "none",
      resize: "none" as const, minHeight: 110,
      boxSizing: "border-box" as const, transition: "all 0.2s",
    } as React.CSSProperties,

    field: { marginBottom: 14 } as React.CSSProperties,

    submitBtn: {
      width: "100%", padding: "16px", borderRadius: 16,
      background: "linear-gradient(135deg, #7c3aed, #9333ea)", color: "#fff", border: "none",
      fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: "1rem",
      cursor: "pointer", marginTop: 8,
      boxShadow: "0 8px 20px rgba(124, 58, 237, 0.25)",
      transition: "all 0.2s ease",
    } as React.CSSProperties,
  };

  // We no longer early-return on `hide`. The component must stay mounted so it
  // can listen for the `open-feedback` window event (dispatched by the mobile
  // BottomNav profile sheet on routes like /fan-dashboard). Only the floating
  // trigger button is suppressed on those routes — the panel itself can still
  // open programmatically.

  return (
    <div className="feedback-button" style={S.wrap}>
      {open && (
        <div ref={panelRef} style={S.panel}>
          <div style={S.panelHeader}>
            <p style={S.panelTitle}>{tab === "feedback" ? "💡 Feedback" : "🐞 Report Bug"}</p>
            <button style={S.closeBtn} onClick={handleToggle} suppressHydrationWarning>✕</button>
          </div>

          <div style={S.tabs}>
            <button style={S.tabBtn(tab === "feedback")} onClick={() => setTab("feedback")} suppressHydrationWarning>💡 Feedback</button>
            <button style={S.tabBtn(tab === "bug")} onClick={() => setTab("bug")} suppressHydrationWarning>🐞 Bug Report</button>
          </div>

          <div style={S.body}>
            {/* Common Fields */}
            <div style={S.field}>
              <label style={S.label}>Name</label>
              <input 
                style={S.input} 
                placeholder="How should we call you?" 
                value={tab === "feedback" ? fbName : bugName} 
                onChange={e => tab === "feedback" ? setFbName(e.target.value) : setBugName(e.target.value)} 
                suppressHydrationWarning
              />
            </div>

            <div style={S.field}>
              <label style={S.label}>Email (Required)</label>
              <input 
                style={S.input} 
                type="email"
                placeholder="your@email.com" 
                value={tab === "feedback" ? fbEmail : bugEmail} 
                onChange={e => tab === "feedback" ? setFbEmail(e.target.value) : setBugEmail(e.target.value)} 
                suppressHydrationWarning
              />
            </div>

            {/* Rating removed per request */}

            <div style={S.field}>
              <label style={S.label}>{tab === "feedback" ? "Message" : "Bug Description"}</label>
              <textarea
                style={S.textarea}
                placeholder={tab === "feedback" ? "What can we improve?" : "What went wrong?"}
                value={tab === "feedback" ? fbMessage : bugMessage}
                onChange={e => tab === "feedback" ? setFbMessage(e.target.value) : setBugMessage(e.target.value)}
                suppressHydrationWarning
              />
            </div>

            <button
              style={{ ...S.submitBtn, opacity: submitting ? 0.7 : 1 }}
              onClick={handleSubmit}
              disabled={submitting}
              suppressHydrationWarning
            >
              {submitting ? "Sending..." : "Submit Report"}
            </button>
          </div>
        </div>
      )}

      {!isMobile && !hide && (
        <button
          ref={btnRef}
          onClick={handleToggle}
          style={S.triggerBtn}
          suppressHydrationWarning
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>{open ? "Close" : "Feedback"}</span>
        </button>
      )}
    </div>
  );
}
