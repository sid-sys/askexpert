"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";

export default function VacationBanner() {
  const { userProfile, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  if (!user || !userProfile?.vacationMode) return null;

  // Do not show on landing page or public profile pages
  const isAdminRoute = ["/dashboard", "/profile", "/analytics"].some(route => pathname.startsWith(route));
  if (!isAdminRoute) return null;

  const handleDisableVacation = async () => {
    if (!user) return;
    try {
      const { doc, updateDoc } = await import("firebase/firestore");
      const { db } = await import("@/lib/firebase");
      await updateDoc(doc(db, "users", user.uid), {
        vacationMode: false
      });
      // The auth context listener will pick this up and hide the banner
    } catch (err) {
      console.error("Failed to disable vacation mode:", err);
    }
  };

  return (
    <div 
      className="animate__animated animate__fadeInDown"
      style={{
        background: "#fbbf24",
        color: "#92400e",
        padding: "10px 24px",
        textAlign: "center",
        fontSize: "0.9rem",
        fontWeight: 800,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "12px",
        borderBottom: "2px solid #b45309",
        zIndex: 1001,
        position: "sticky",
        top: 0
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
        <span style={{ fontSize: "1.2rem" }}>🏖️</span>
        <span>
          <strong>Vacation Mode is Active!</strong> You are currently not accepting new questions. 
        </span>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={handleDisableVacation}
            style={{
              background: "#b45309",
              color: "#fff",
              border: "none",
              padding: "6px 14px",
              borderRadius: 8,
              fontSize: "0.75rem",
              fontWeight: 900,
              cursor: "pointer",
              boxShadow: "0 2px 0 #78350f",
            }}
          >
            Disable Now
          </button>
        </div>
      </div>
    </div>
  );
}
