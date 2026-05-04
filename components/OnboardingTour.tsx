"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Step, STATUS } from "react-joyride";

const Joyride: any = dynamic(() => import("react-joyride").then((mod) => mod.Joyride as any), { ssr: false });

interface OnboardingTourProps {
  userId?: string;
  onComplete?: () => void;
}

export default function OnboardingTour({ userId, onComplete }: OnboardingTourProps) {
  const [run, setRun] = useState(false);

  useEffect(() => {
    // Start tour if not completed before for THIS user
    const tourKey = `askexpert_tour_completed_${userId}`;
    const hasCompletedTour = localStorage.getItem(tourKey);
    
    if (!hasCompletedTour) {
      // Small delay to ensure GSAP animations finish and elements are rendered
      const timer = setTimeout(() => setRun(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [userId]);

  const steps: Step[] = [
    {
      target: ".sb-nav",
      content: (
        <div>
          <h3 style={{ margin: "0 0 10px 0", color: "var(--purple)" }}>Welcome to Your New Workspace! 🚀</h3>
          <p>We've upgraded your navigation. Your dashboard, analytics, and settings are now all quickly accessible from this dark side menu.</p>
        </div>
      ),
      placement: "right",
    },
    {
      target: ".settings-header",
      content: "This is where you manage your public presence and monetization. Keep your info updated to get more questions!",
      placement: "bottom",
    },
    {
      target: ".card-brutal-purple",
      content: "Start by filling out your basic info. Your Bio and Tagline help people understand why they should ask you questions.",
      placement: "right",
    },
    {
      target: "#username-input-group",
      content: "Your public handle defines your unique URL. You can change it anytime, but remember it will break your old links!",
      placement: "top",
    },
    {
      target: ".settings-tabs",
      content: "Switch between Profile, Pricing, and Payout settings here. Each tab has specialized options for your business.",
      placement: "bottom",
    },
    {
      target: "#btn-preview-toggle",
      content: "Pro Tip: Use the Live Preview to see exactly how your profile looks to your followers while you edit.",
      placement: "left",
    },
    {
      target: ".status-bubble-container",
      content: "Don't worry about saving! Every change you make is automatically saved as you type. ✨",
      placement: "left",
    },
  ];

  const handleJoyrideCallback = (data: any) => {
    const { status } = data;
    if (([STATUS.FINISHED, STATUS.SKIPPED] as string[]).includes(status)) {
      setRun(false);
      if (userId) {
        localStorage.setItem(`askexpert_tour_completed_${userId}`, "true");
      }
      if (onComplete) onComplete();
    }
  };

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      showProgress
      showSkipButton
      callback={handleJoyrideCallback}
      styles={({
        options: {
          primaryColor: "#7c3aed",
          backgroundColor: "#fff",
          textColor: "#1f2937",
          arrowColor: "#fff",
          zIndex: 10000,
        },
        tooltip: {
          borderRadius: 24,
          padding: 24,
          boxShadow: "0 20px 40px rgba(124,58,237,0.15)",
          border: "1px solid rgba(124,58,237,0.1)",
        },
        tooltipContainer: {
          textAlign: "left",
        },
        buttonNext: {
          borderRadius: 99,
          backgroundColor: "#7c3aed",
          fontWeight: 700,
          padding: "10px 24px",
          boxShadow: "0 4px 14px rgba(124,58,237,0.3)",
          fontSize: "0.9rem",
          transition: "all 0.2s"
        },
        buttonBack: {
          marginRight: 14,
          fontWeight: 700,
          color: "#6b7280",
          fontSize: "0.9rem"
        },
        buttonSkip: {
          fontWeight: 700,
          color: "#ef4444",
          fontSize: "0.9rem",
          background: "rgba(239,68,68,0.1)",
          padding: "8px 16px",
          borderRadius: 99,
        }
      } as any)}
    />
  );
}
