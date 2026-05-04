"use client";
import { useEffect, useRef } from "react";
import gsap from "gsap";

export default function GSAPTransition({ children }: { children: React.ReactNode }) {
  const comp = useRef(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(comp.current, {
        opacity: 0,
        y: 15,
        duration: 0.4,
        ease: "power2.out",
      });
    }, comp);
    return () => ctx.revert();
  }, []);

  return <div ref={comp} style={{ opacity: 1, willChange: "transform, opacity" }}>{children}</div>;
}
