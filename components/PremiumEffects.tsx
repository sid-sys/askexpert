"use client";

import { useEffect } from "react";
import AOS from "aos";
import "aos/dist/aos.css";
import Lenis from "lenis";
import "animate.css";

export default function PremiumEffects() {
  useEffect(() => {
    // 1. Initialize AOS (Scroll Animations)
    AOS.init({
      duration: 800,
      once: true,
      easing: "ease-out-quad",
    });

    // 2. Initialize Lenis (Smooth Scrolling)
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);

    return () => {
      lenis.destroy();
    };
  }, []);

  return null;
}
