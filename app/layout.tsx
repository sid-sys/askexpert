import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import BottomNav from "@/components/BottomNav";
import NavBar from "@/components/NavBar";
import Sidebar from "@/components/Sidebar";
import SidebarShell from "@/components/SidebarShell";
import VacationBanner from "@/components/VacationBanner";
import Footer from "@/components/Footer";
import ErrorSuppressor from "@/components/ErrorSuppressor";
import CookieConsent from "@/components/CookieConsent";
import PremiumEffects from "@/components/PremiumEffects";
import FeedbackButton from "@/components/FeedbackButton";
import PresenceHeartbeat from "@/components/PresenceHeartbeat";

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "AskExpert – Your Knowledge Has Value",
  description:
    "Turn your expertise into earnings. Set your rate, share your link, and get paid for answering questions.",
  keywords: ["ask expert", "creator monetization", "paid Q&A", "expert answers"],
  openGraph: {
    title: "AskExpert – Your Knowledge Has Value",
    description: "Turn your expertise into earnings. Simple Q&A links for creators and experts.",
    type: "website",
    images: [{ url: "/logo.png", width: 1240, height: 1240, alt: "AskExpert" }],
  },
  icons: {
    icon: [
      { url: "/logo.png", type: "image/png" },
    ],
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css" />
      </head>
      <body suppressHydrationWarning>
        <ErrorSuppressor />
        <ThemeProvider>
          <AuthProvider>
            {/* Persistent dark sidebar — visible on desktop only */}
            <Suspense fallback={null}>
              <Sidebar />
            </Suspense>

            {/* Main content area — shifts right when sidebar is shown */}
            <SidebarShell>
              <VacationBanner />
              <NavBar />
              {/* main is a flex column so children that opt into `flex: 1` +
                  `min-height: 0` (e.g. the chat pages) can size themselves to
                  exactly the remaining viewport without overflowing. Regular
                  pages with intrinsic content still render normally. */}
              <main style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>{children}</main>
              <Footer />
            </SidebarShell>

            <CookieConsent />
            <PremiumEffects />
            <FeedbackButton />
            <Suspense fallback={null}>
              <BottomNav />
            </Suspense>
            <PresenceHeartbeat />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
