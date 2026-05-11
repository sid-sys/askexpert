"use client";

import { use, useEffect, useState } from "react";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useRouter } from "next/navigation";

import { FirestoreUser, FirestoreQuestion, SocialLink, COLLECTIONS } from "@/lib/types";
import PriceToggle from "@/components/PriceToggle";
import RichComposer, { Attachment } from "@/components/RichComposer";
import { getPPPFactor } from "@/lib/ppp";
import Swal from "sweetalert2";
import { useAuth } from "@/context/AuthContext";

// ── helpers ─────────────────────────────────────────────────────────────────
const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

function renderTextWithLinks(text: string) {
  const parts = text.split(URL_RE);
  return parts.map((part, i) =>
    URL_RE.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer"
        style={{ color: "var(--purple)", fontWeight: 600, wordBreak: "break-all" }}>
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function timeAgo(date: Date | null | undefined): string {
  if (!date) return "";
  const d = (date as any)?.toDate ? (date as any).toDate() : new Date(date);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function formatResponseTime(hours: number): string {
  if (hours < 1) {
    const mins = Math.round(hours * 60);
    return `${mins} minute${mins !== 1 ? "s" : ""}`;
  }
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""}`;
  if (hours === 24) return "24 hours";
  if (hours === 48) return "48 hours";
  if (hours === 72) return "72 hours";
  if (hours === 168) return "1 week";
  return `${hours} hours`;
}

// Guess a simple icon from label text
function guessIcon(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("twitter") || l.includes("x.com")) return "𝕏";
  if (l.includes("instagram")) return "📸";
  if (l.includes("youtube")) return "▶️";
  if (l.includes("linkedin")) return "💼";
  if (l.includes("github")) return "🐙";
  if (l.includes("tiktok")) return "🎵";
  if (l.includes("discord")) return "💬";
  if (l.includes("website") || l.includes("blog") || l.includes("portfolio")) return "🌐";
  return "🔗";
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  usd: "$",
  gbp: "£",
  eur: "€",
  inr: "₹",
  cad: "CA$",
  aud: "AU$",
  sgd: "S$",
};

// ── preview type ─────────────────────────────────────────────────────────────
type PreviewData = Partial<FirestoreUser>;

// ── section card style ───────────────────────────────────────────────────────
const SECTION: React.CSSProperties = {
  borderRadius: 20,
  border: "1px solid #e5e7eb",
  boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
  padding: "28px 28px",
  background: "#fff",
  marginBottom: 20,
};

const SECTION_TITLE: React.CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  color: "var(--muted)",
  marginBottom: 16,
};

// ─────────────────────────────────────────────────────────────────────────────

export default function CreatorProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const [creator, setCreator]             = useState<FirestoreUser | null>(null);
  const [previewOverlay, setPreviewOverlay] = useState<PreviewData | null>(null);
  const [notFoundFlag, setNotFoundFlag]   = useState(false);
  const [payMode, setPayMode]             = useState<"one-time" | "monthly">("one-time");
  const [countryCode, setCountryCode]     = useState<string | null>(null);
  const [isInsidePreviewIframe, setIsInsidePreviewIframe] = useState(false);

  useEffect(() => {
    setIsInsidePreviewIframe(window.self !== window.top);
  }, []);

  // Ask form
  const [question,    setQuestion]    = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [email,       setEmail]       = useState("");
  const [name,        setName]        = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const [submitted,   setSubmitted]   = useState(false);

  const { user, userProfile } = useAuth();
  const router = useRouter();

  // Pre-fill user info if logged in
  useEffect(() => {
    if (userProfile) {
      if (!name) setName(userProfile.displayName || "");
      if (!email) setEmail(userProfile.email || "");
    }
  }, [userProfile]);

  // Vacation notification form
  const [subscribingEmail, setSubscribingEmail] = useState("");
  const [isSubscribing,    setIsSubscribing]    = useState(false);

  // Public Q&A
  const [publicQA,         setPublicQA]         = useState<FirestoreQuestion[]>([]);
  const [qaExpanded,       setQaExpanded]       = useState<Record<string, boolean>>({});
  const [publicQaCollapsed, setPublicQaCollapsed] = useState(false);

  // Subscription state
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [checkingSub,  setCheckingSub]  = useState(false);

  const display = previewOverlay ? { ...creator, ...previewOverlay } : creator;

  // ── listen for live-preview postMessage ─────────────────────────────────
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === "__PREVIEW__") setPreviewOverlay(e.data.data as PreviewData);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Detect country for PPP
  useEffect(() => {
    const fetchCountry = async () => {
      try {
        const res = await fetch("https://ipapi.co/json/");
        if (!res.ok) throw new Error("IP lookup failed");
        const data = await res.json();
        setCountryCode(data.country_code);
      } catch (err) {
        console.warn("PPP country lookup failed, defaulting to 1.0", err);
        setCountryCode(null);
      }
    };
    fetchCountry();
  }, []);

  // ── Check if user is already a subscriber ────────────────────────────────
  useEffect(() => {
    if (!user || !display?.uid) {
      setIsSubscribed(false);
      return;
    }
    
    const checkSub = async () => {
      setCheckingSub(true);
      try {
        const q = query(
          collection(db, COLLECTIONS.SUBSCRIPTIONS),
          where("creatorId", "==", display.uid),
          where("followerId", "==", user.uid),
          where("status", "==", "active")
        );
        const snap = await getDocs(q);
        setIsSubscribed(!snap.empty);
      } catch (err) {
        console.error("Error checking subscription status:", err);
      } finally {
        setCheckingSub(false);
      }
    };
    
    checkSub();
  }, [user, display?.uid]);

  // ── fetch creator (skipped when inside settings live-preview iframe) ───────
  useEffect(() => {
    // When embedded in the settings preview panel, skip Firestore entirely.
    // The parent frame sends all profile data via __PREVIEW__ postMessage.
    if (isInsidePreviewIframe) return;

    let unsubscribe: (() => void) | undefined;
    let qaFetched = false;

    const initListener = async () => {
      const { onSnapshot } = await import("firebase/firestore");
      const q = query(
        collection(db, COLLECTIONS.USERS),
        where("username", "==", username)
      );

      // Subscribe directly — onSnapshot auto-retries on transient network errors
      // and is authoritative once the server responds. (Using getDocs() first
      // could return snap.empty from a cold persistent cache and 404 incorrectly.)
      unsubscribe = onSnapshot(
        q,
        { includeMetadataChanges: true },
        (snap) => {
          if (snap.empty) {
            // Only trust an empty result once it's confirmed by the server,
            // not while the SDK is still serving cached/local data.
            if (!snap.metadata.fromCache) setNotFoundFlag(true);
            return;
          }
          const docSnap = snap.docs[0];
          const raw = docSnap.data();
          const data = {
            ...raw as FirestoreUser,
            uid: docSnap.id,
            lastSeen: (raw as any).lastSeen?.toDate?.() || null,
            vacationUntil: (raw as any).vacationUntil?.toDate?.() || null,
          };
          setCreator(data);
          setNotFoundFlag(false);
          if (!qaFetched) {
            qaFetched = true;
            fetchPublicQA(data.uid);
          }
        },
        (err) => {
          console.error("Firestore onSnapshot error:", err);
        }
      );
    };

    const fetchPublicQA = async (creatorId: string) => {
      try {
        const qqs = query(
          collection(db, COLLECTIONS.QUESTIONS),
          where("creatorId", "==", creatorId),
          where("isPublicAnswer", "==", true),
          where("status", "==", "ANSWERED"),
          orderBy("answeredAt", "desc")
        );
        const qsnap = await getDocs(qqs);
        setPublicQA(qsnap.docs.map((d) => {
          const qd = d.data();
          return {
            ...qd, id: d.id,
            createdAt:  qd.createdAt?.toDate?.()  || new Date(),
            answeredAt: qd.answeredAt?.toDate?.()  || null,
            expiresAt:  qd.expiresAt?.toDate?.()   || new Date(),
          } as FirestoreQuestion;
        }));
      } catch {
        // index may not exist yet — silent
      }
    };

    initListener();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [username, isInsidePreviewIframe]);

  // ── merge preview overlay ────────────────────────────────────────────────
  if (!display && !notFoundFlag) {
    // Inside the preview iframe, show a loading shimmer while waiting for postMessage
    if (isInsidePreviewIframe) {
      return (
        <div style={{ padding: "40px 24px", maxWidth: 660, margin: "0 auto" }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: i === 1 ? 140 : 80, background: "#ededee", borderRadius: 16, marginBottom: 16, animation: "pulse 1.5s ease-in-out infinite" }} />
          ))}
        </div>
      );
    }
    return null;
  }
  if (notFoundFlag) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb" }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: "3rem", fontWeight: 900, color: "#111827", marginBottom: 16 }}>404</h1>
        <p style={{ color: "#6b7280", fontSize: "1.1rem" }}>User not found.</p>
        <button onClick={() => router.push("/")} className="btn-purple" style={{ marginTop: 24 }}>Back Home</button>
      </div>
    </div>
  );

  // ── build content (text + file names) ──────────────────────────────────────
  function buildContent() {
    return question.trim();
  }

  // ── handle vacation notify me ───────────────────────────────────────────
  const handleSubscribe = async () => {
    if (!subscribingEmail.trim() || !subscribingEmail.includes("@")) {
      Swal.fire({ title: "Oops!", text: "Please enter a valid email address.", icon: "error" });
      return;
    }
    if (!display?.uid) return;

    setIsSubscribing(true);
    try {
      const res = await fetch("/api/vacation/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creatorId: display.uid,
          userEmail: subscribingEmail.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Subscription failed");

      Swal.fire({
        title: "You're on the list! 🎉",
        text: `We'll email you the second ${display.displayName} is back.`,
        icon: "success",
        confirmButtonColor: "var(--purple)",
      });
      setSubscribingEmail("");
    } catch (err: any) {
      Swal.fire({ title: "Error", text: err.message, icon: "error" });
    } finally {
      setIsSubscribing(false);
    }
  };

  // ── subscribe-only (no question required) ───────────────────────────────
  const handleSubscribeClick = async () => {
    // Prevent creator from subscribing to their own page
    if (user && display && user.uid === display.uid) {
      Swal.fire({
        title: "That's your page!",
        text: "You can't subscribe to your own creator profile.",
        icon: "info",
        confirmButtonColor: "var(--purple)",
      });
      return;
    }
    if (!user) {
      router.push(`/auth?mode=signup&redirect=${encodeURIComponent("/" + username)}`);
      return;
    }
    if (isSubscribed) {
      router.push("/dashboard");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creatorId: display!.uid,
          content: "Monthly subscription",
          followerEmail: email || (userProfile as any)?.email || user.email || "",
          followerName: name || (userProfile as any)?.displayName || "Fan",
          mode: "monthly",
          price: display!.monthlyPrice,
          stripeAccountId: (display as any).stripeAccountId ?? null,
          countryCode,
          attachmentUrls: [],
          followerUid: user.uid,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        Swal.fire({ title: "Payment Error", text: data.error || "Payment setup failed.", icon: "error", confirmButtonColor: "var(--purple)" });
      }
    } catch (err: any) {
      Swal.fire({ title: "Error", text: err.message, icon: "error", confirmButtonColor: "var(--purple)" });
    } finally {
      setSubmitting(false);
    }
  };

  // ── submit ───────────────────────────────────────────────────────────────
  // Always route through Stripe checkout — platform collects if creator
  // hasn't set up Connect yet; funds are manually transferred.
  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!display) return;
    
    if (!name.trim()) {
      Swal.fire({
        title: "Name Required",
        text: "Please provide your name so the creator knows who is asking.",
        icon: "warning",
        confirmButtonColor: "var(--purple)",
      });
      return;
    }

    if (!question.trim()) {
      Swal.fire({
        title: "Question Required",
        text: "Please enter your question before proceeding.",
        icon: "warning",
        confirmButtonColor: "var(--purple)",
      });
      return;
    }

    if (!email.trim()) {
      Swal.fire({
        title: "Email Required",
        text: "Please provide your email address so we can deliver the answer.",
        icon: "warning",
        confirmButtonColor: "var(--purple)",
      });
      return;
    }

    // Monthly subscription requires login
    if (payMode === "monthly" && !user) {
      Swal.fire({
        title: "Login Required",
        text: "Monthly subscriptions require an account so you can manage your membership and chat with the creator.",
        icon: "info",
        showCancelButton: true,
        confirmButtonText: "Log In / Sign Up",
        cancelButtonText: "Maybe Later",
        confirmButtonColor: "var(--purple)",
      }).then((result) => {
        if (result.isConfirmed) {
          router.push(`/auth?redirect=${encodeURIComponent(window.location.pathname)}`);
        }
      });
      return;
    }

    // If already subscribed, we can just create the question in Firestore directly
    if (isSubscribed && payMode === "monthly") {
      setSubmitting(true);
      try {
        const content = buildContent();
        
        // ── Upload attachments if any ───────────────────────────────────────────
        const attachmentUrls: string[] = [];
        for (const att of attachments) {
          if (att.file) {
            const storageRef = ref(storage, `asker_attachments/${Date.now()}_${att.file.name}`);
            await uploadBytes(storageRef, att.file);
            const url = await getDownloadURL(storageRef);
            attachmentUrls.push(url);
          }
        }

        const { addDoc, collection, serverTimestamp } = await import("firebase/firestore");
        await addDoc(collection(db, COLLECTIONS.QUESTIONS), {
          creatorId: display.uid,
          content,
          followerEmail: email.trim(),
          followerName: name.trim(),
          status: "PENDING",
          pricePaid: 0,
          createdAt: serverTimestamp(),
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000), // 72 hours
          attachmentUrls,
          followerUid: user?.uid || null,
          response: null,
          stripePaymentIntentId: "SUB_FREE", // Mark as free via subscription
          stripeChargeId: null,
        });

        setSubmitted(true);
        setQuestion("");
        setAttachments([]);
        Swal.fire({
          title: "Question Sent! 🚀",
          text: "Since you are an active subscriber, your question has been sent directly to the creator.",
          icon: "success",
          confirmButtonColor: "var(--purple)",
        });
      } catch (err: any) {
        console.error(err);
        Swal.fire({ title: "Error", text: err.message, icon: "error" });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    try {
      const content = buildContent();
      const price   = payMode === "one-time" ? display.perQuestionPrice : display.monthlyPrice;

      // ── Upload attachments if any ───────────────────────────────────────────
      const attachmentUrls: string[] = [];
      for (const att of attachments) {
        if (att.file) {
          const storageRef = ref(storage, `asker_attachments/${Date.now()}_${att.file.name}`);
          
          // Add a 10-second timeout to prevent infinite hang if Storage isn't enabled
          const uploadTask = uploadBytes(storageRef, att.file);
          const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Storage timeout")), 10000));
          
          try {
            await Promise.race([uploadTask, timeout]);
          } catch (e: any) {
            if (e.message === "Storage timeout") {
              throw new Error("File upload timed out. Please ensure Firebase Storage is enabled in your Firebase Console and Security Rules allow uploads.");
            }
            throw e;
          }
          
          const url = await getDownloadURL(storageRef);
          attachmentUrls.push(url);
        }
      }

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creatorId:       display.uid,
          content,
          followerEmail:   email.trim(),
          followerName:    name.trim(),
          mode:            payMode,
          price,
          stripeAccountId: display.stripeAccountId ?? null,
          countryCode,
          attachmentUrls,
          followerUid:     user?.uid || null,
        }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        Swal.fire({
          title: "Payment Error",
          text: data.error || "Payment setup failed. Please try again.",
          icon: "error",
          confirmButtonColor: "var(--purple)",
        });
      }
    } catch (err: any) {
      console.error(err);
      Swal.fire({
        title: "Something went wrong",
        text: err.message || "Please try again later.",
        icon: "error",
        confirmButtonColor: "var(--purple)",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ── 404 ──────────────────────────────────────────────────────────────────
  if (notFoundFlag) {
    return (
      <div style={{ textAlign: "center", padding: "120px 24px" }}>
        <h1 className="font-display" style={{ fontSize: "4rem", color: "var(--orange)" }}>404 💀</h1>
        <p style={{ color: "var(--muted)" }}>Creator not found or not active.</p>
      </div>
    );
  }

  // ── derived values ───────────────────────────────────────────────────────
  const slaLabel  = formatResponseTime(display.responseTimeHours || 72);
  const pppFactor = (display as any).pppEnabled && countryCode ? getPPPFactor(countryCode) : 1.0;
  const currencySymbol = CURRENCY_SYMBOLS[(display.currency || "usd").toLowerCase()] || "$";
  const socialLinks: SocialLink[] = Array.isArray((display as any).socialLinks)
    ? (display as any).socialLinks
    : [];
  const categories: string[]   = (display as any).categories ?? [];

  return (
    <>
    {/* PUBLIC PROFILE NAVBAR */}
    <nav style={{
      position: "sticky", top: 0, zIndex: 100,
      background: "rgba(255,255,255,0.88)",
      backdropFilter: "blur(14px)",
      WebkitBackdropFilter: "blur(14px)",
      borderBottom: "2px solid rgba(0,0,0,0.07)",
      boxShadow: "0 2px 20px rgba(0,0,0,0.05)",
    }}>
      <div style={{
        maxWidth: 780, margin: "0 auto", padding: "0 24px",
        height: 60, display: "flex", alignItems: "center",
        justifyContent: "space-between", gap: 12,
      }}>

        {/* Logo */}
        <a href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{
            width: 30, height: 30,
            background: "linear-gradient(135deg, #7c3aed, #a855f7)",
            borderRadius: 8, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: "1rem",
            boxShadow: "0 2px 8px rgba(124,58,237,0.35)",
          }}>&#x1F480;</div>
          <span style={{
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 800, fontSize: "1.05rem", color: "#1f2937",
          }}>AskExpert</span>
        </a>

        {/* Creator pill removed by user request */}

        {/* Nav links + CTA */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <button
            onClick={() => document.getElementById("ask")?.scrollIntoView({ behavior: "smooth" })}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: "0.82rem",
              color: "#6b7280", padding: "6px 10px", borderRadius: 8,
            }}
          >
            Ask
          </button>
          {publicQA.length > 0 && (
            <button
              onClick={() => document.getElementById("public-qa")?.scrollIntoView({ behavior: "smooth" })}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: "0.82rem",
                color: "#6b7280", padding: "6px 10px", borderRadius: 8,
              }}
            >
              Q&amp;A
            </button>
          )}
          {!previewOverlay && (
            <a
              href="/auth"
              style={{
                background: "linear-gradient(135deg, #7c3aed, #a855f7)",
                color: "#fff", borderRadius: 99, padding: "7px 16px",
                fontFamily: "'Inter', sans-serif", fontWeight: 700,
                fontSize: "0.78rem", textDecoration: "none",
                boxShadow: "0 2px 10px rgba(124,58,237,0.3)",
                whiteSpace: "nowrap",
              }}
            >
              Create Your Page
            </a>
          )}
        </div>
      </div>
    </nav>

    <div className="profile-container" style={{ maxWidth: 660, margin: "0 auto", padding: "36px 24px 100px" }}>

      {/* VACATION MODE BANNER */}
      {display.vacationMode && (
        <div style={{
          background: "linear-gradient(135deg, #fef3c7 0%, #fffbeb 100%)",
          border: "2px solid #fbbf24",
          borderRadius: 20,
          padding: "24px",
          marginBottom: 24,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: 12,
          boxShadow: "0 10px 30px rgba(251,191,36,0.15)",
          animation: "fadeInDown 0.6s ease-out"
        }}>
          <div style={{ fontSize: "2.5rem" }}>🌴</div>
          <div>
            <h3 style={{ margin: 0, color: "#92400e", fontSize: "1.2rem", fontWeight: 800 }}>
              Creator is on Vacation
            </h3>
            <p style={{ margin: "4px 0 0", color: "#b45309", fontSize: "0.95rem", fontWeight: 600 }}>
              {display.vacationMessage || `${display.displayName} is taking a break and not accepting new questions right now.`}
            </p>
            {display.vacationUntil && (
              <div style={{ 
                marginTop: 12, 
                display: "inline-block",
                padding: "6px 16px", 
                background: "#fbbf24", 
                color: "#fff", 
                borderRadius: 99,
                fontSize: "0.85rem",
                fontWeight: 800
              }}>
                📅 Expected back: {display.vacationUntil.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
            )}

            {/* Subscribe Form */}
            <div style={{ marginTop: 24, width: "100%", maxWidth: 400 }}>
              <p style={{ color: "#92400e", fontSize: "0.85rem", fontWeight: 700, marginBottom: 8 }}>
                Get notified the second they're back:
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                <input 
                  className="input-brutal" 
                  style={{ flex: 1, minWidth: 200, height: 44, border: "2px solid #fbbf24" }} 
                  placeholder="Your email address" 
                  value={subscribingEmail}
                  onChange={(e) => setSubscribingEmail(e.target.value)}
                />
                <button 
                  onClick={handleSubscribe}
                  disabled={isSubscribing}
                  style={{
                    background: "#fbbf24", color: "#fff", border: "2px solid #fbbf24",
                    borderRadius: 12, padding: "0 20px", height: 44, fontWeight: 900,
                    cursor: "pointer", transition: "all 0.2s",
                    boxShadow: "0 4px 0 #b45309",
                  }}
                  onMouseDown={e => e.currentTarget.style.transform = "translateY(2px)"}
                  onMouseUp={e => e.currentTarget.style.transform = ""}
                >
                  {isSubscribing ? "..." : "Notify Me 🔔"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LIVE PREVIEW BANNER */}
      {previewOverlay && (
        <div style={{
          background: "var(--purple)", color: "#fff",
          padding: "8px 16px", borderRadius: 10, marginBottom: 20,
          fontSize: "0.8rem", fontWeight: 700, textAlign: "center",
          boxShadow: "0 4px 20px rgba(124,58,237,0.3)",
        }}>
          👁️ LIVE PREVIEW — changes reflect in real-time from Settings
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* SECTION 1 — BASIC INFO                                 */}
      {/* ══════════════════════════════════════════════════════ */}
      <div style={{ ...SECTION, borderColor: "var(--purple, #7c3aed)", background: "linear-gradient(135deg, #faf5ff 0%, #fff 100%)" }}>
        {/* Avatar + name row */}
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start", marginBottom: 20 }}>
          {/* Avatar */}
          <div style={{
            width: 80, height: 80, flexShrink: 0,
            background: "var(--purple)", borderRadius: "50%",
            border: "3px solid #fff",
            boxShadow: "0 0 0 3px #7c3aed, 0 4px 16px rgba(124,58,237,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "2rem", overflow: "hidden",
          }}>
            {display.photoURL
              ? <img src={display.photoURL} alt={display.displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : display.displayName?.[0]?.toUpperCase() || "?"}
            
            {/* Online/Offline Indicator */}
            <div style={{
              position: "absolute",
              bottom: 4,
              right: 4,
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: display.vacationMode ? "#fbbf24" : (display.isOnline ? "#10b981" : "#9ca3af"),
              border: "3px solid #fff",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
            }} title={display.isOnline ? "Online" : "Offline"} />
          </div>

          {/* Name + handle */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h1 className="font-display" style={{ 
                fontSize: "2.2rem", 
                color: "var(--purple)", 
                lineHeight: 1.1, 
                margin: 0,
                overflowWrap: "anywhere" 
              }}>
                {display.displayName}
              </h1>
              {display.isOnline && !display.vacationMode && (
                <span style={{
                  background: "rgba(16,185,129,0.1)",
                  color: "#059669",
                  padding: "4px 10px",
                  borderRadius: 99,
                  fontSize: "0.65rem",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  border: "1px solid rgba(16,185,129,0.2)"
                }}>
                  Online Now
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <p style={{ 
                color: "var(--muted)", 
                fontSize: "0.85rem", 
                margin: 0,
                overflowWrap: "anywhere"
              }}>
                @{display.username}
              </p>
              {!display.isOnline && display.lastSeen && !display.vacationMode && (
                <>
                  <span style={{ color: "#e5e7eb" }}>•</span>
                  <span style={{ color: "var(--muted)", fontSize: "0.75rem", fontWeight: 500 }}>
                    Last seen {timeAgo(display.lastSeen)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tagline */}
        {(display as any).tagline && (
          <p style={{
            fontSize: "1.05rem", fontWeight: 700, lineHeight: 1.45,
            color: "var(--text)", margin: "0 0 14px",
            padding: "10px 14px",
            background: "rgba(124,58,237,0.06)",
            borderLeft: "4px solid var(--purple)",
            borderRadius: "0 8px 8px 0",
            overflowWrap: "anywhere"
          }}>
            {(display as any).tagline}
          </p>
        )}

        {/* Bio */}
        {display.bio && (
          <p style={{
            color: "var(--text)", lineHeight: 1.75, fontSize: "0.95rem",
            margin: 0, opacity: 0.88,
            overflowWrap: "anywhere"
          }}>
            {display.bio}
          </p>
        )}

        {/* SLA badge */}
        <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "4px 12px",
            background: "rgba(249,115,22,0.1)", color: "var(--orange)",
            border: "1.5px solid var(--orange)", borderRadius: 99,
            fontSize: "0.78rem", fontWeight: 700,
          }}>
            ⏱️ Response time: {slaLabel}
          </span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════ */}
      {/* SECTION 2 — SOCIAL LINKS                              */}
      {/* ══════════════════════════════════════════════════════ */}
      {socialLinks.length > 0 && (
        <div style={SECTION}>
          <p style={SECTION_TITLE}>🔗 Links</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {socialLinks.filter(l => l.url).map((link, i) => (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "7px 16px",
                  background: "#fff",
                  border: "1.5px solid #e5e7eb",
                  borderRadius: 99, fontSize: "0.85rem", fontWeight: 700,
                  color: "#374151", textDecoration: "none",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                  transition: "transform 0.15s, box-shadow 0.15s",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.1)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = "";
                  e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)";
                }}
              >
                {guessIcon(link.label)} {link.label}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* SECTION 3 — EXPERTISE CATEGORIES                      */}
      {/* ══════════════════════════════════════════════════════ */}
      {categories.length > 0 && (
        <div style={SECTION}>
          <p style={SECTION_TITLE}>🏷️ Expertise</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {categories.map((c: string) => (
              <span key={c} style={{
                padding: "5px 14px",
                background: "#fafafa",
                border: "1.5px solid #e5e7eb",
                borderRadius: 99, fontSize: "0.82rem", fontWeight: 700,
                color: "#374151", boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
              }}>{c}</span>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* SECTION 4 — PRICING                                   */}
      {/* ══════════════════════════════════════════════════════ */}
      <div style={{ ...SECTION, background: "linear-gradient(135deg, #f0fdf4 0%, #fff 100%)" }}>
        <p style={SECTION_TITLE}>💰 Pricing</p>

        {/* Two (or three) price cards — click to select payment mode */}
        <div style={{
          display: "grid",
          gridTemplateColumns: payMode === "monthly" && (display as any).subscriberPerks?.length > 0
            ? "1fr 1fr 1fr"
            : "1fr 1fr",
          gap: 14,
          marginBottom: 20,
          transition: "all 0.2s",
        }}>
          {/* One-time */}
          <div
            onClick={() => setPayMode("one-time")}
            role="button"
            aria-pressed={payMode === "one-time"}
            style={{
              padding: "16px 18px",
              background: "#f0fdf4",
              border: payMode === "one-time" ? "2.5px solid var(--green)" : "1.5px solid #d1fae5",
              borderRadius: 14,
              boxShadow: payMode === "one-time"
                ? "0 0 0 4px rgba(5,150,105,0.12), 0 2px 12px rgba(5,150,105,0.12)"
                : "0 2px 12px rgba(5,150,105,0.08)",
              cursor: "pointer",
              transition: "all 0.18s ease",
              transform: payMode === "one-time" ? "translateY(-2px)" : "none",
              position: "relative",
            }}
          >
            {payMode === "one-time" && (
              <span style={{
                position: "absolute", top: 8, right: 8,
                background: "var(--green)", color: "#fff",
                fontSize: "0.6rem", fontWeight: 800,
                padding: "2px 7px", borderRadius: 99, letterSpacing: "0.04em",
              }}>SELECTED</span>
            )}
            <p style={{ color: "var(--muted)", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", margin: "0 0 6px" }}>
              Single Question
            </p>
            <p style={{ fontSize: "2rem", fontWeight: 900, color: "var(--green)", margin: 0, lineHeight: 1 }}>
              {currencySymbol}{(((display.perQuestionPrice || 0) * pppFactor) / 100).toFixed(2)}
            </p>
            <p style={{ color: "var(--muted)", fontSize: "0.75rem", margin: "4px 0 0" }}>
              one-time {pppFactor < 1 && <span style={{ color: "var(--green)", fontWeight: 700 }}>(-{Math.round((1 - pppFactor) * 100)}% PPP)</span>}
            </p>
          </div>

          {/* Monthly */}
          <div
            onClick={() => setPayMode("monthly")}
            role="button"
            aria-pressed={payMode === "monthly"}
            style={{
              padding: "16px 18px",
              background: "#faf5ff",
              border: payMode === "monthly" ? "2.5px solid var(--purple)" : "1.5px solid #ede9fe",
              borderRadius: 14,
              boxShadow: payMode === "monthly"
                ? "0 0 0 4px rgba(124,58,237,0.1), 0 2px 12px rgba(124,58,237,0.12)"
                : "0 2px 12px rgba(124,58,237,0.08)",
              cursor: "pointer",
              transition: "all 0.18s ease",
              transform: payMode === "monthly" ? "translateY(-2px)" : "none",
              position: "relative",
            }}
          >
            {isSubscribed ? (
               <span style={{
                position: "absolute", top: 8, right: 8,
                background: "var(--green)", color: "#fff",
                fontSize: "0.6rem", fontWeight: 800,
                padding: "2px 7px", borderRadius: 99, letterSpacing: "0.04em",
              }}>ACTIVE MEMBER</span>
            ) : payMode === "monthly" && (
              <span style={{
                position: "absolute", top: 8, right: 8,
                background: "var(--purple)", color: "#fff",
                fontSize: "0.6rem", fontWeight: 800,
                padding: "2px 7px", borderRadius: 99, letterSpacing: "0.04em",
              }}>SELECTED</span>
            )}
            <p style={{ color: "var(--muted)", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", margin: "0 0 6px" }}>
              Monthly Subscriber
            </p>
            <p style={{ fontSize: "2rem", fontWeight: 900, color: "var(--purple)", margin: 0, lineHeight: 1 }}>
              {isSubscribed ? "Active" : `${currencySymbol}${(((display.monthlyPrice || 0) * pppFactor) / 100).toFixed(2)}`}
            </p>
            <p style={{ color: "var(--muted)", fontSize: "0.75rem", margin: "4px 0 0" }}>
              {isSubscribed ? "You are a member!" : (
                <>
                  per month {pppFactor < 1 ? `(-${Math.round((1 - pppFactor) * 100)}% PPP)` : ""}
                  {!user && <span style={{ display: "block", color: "var(--purple)", fontWeight: 700, marginTop: 4 }}>• Login required to subscribe</span>}
                </>
              )}
            </p>
          </div>

          {/* Subscriber perks — appears as 3rd column when Monthly is selected */}
          {payMode === "monthly" && (display as any).subscriberPerks?.length > 0 && (
            <div style={{
              padding: "16px 18px",
              background: "#faf5ff",
              border: "1.5px solid #ede9fe",
              borderRadius: 14,
              boxShadow: "0 2px 12px rgba(124,58,237,0.06)",
              animation: "fadeIn 0.2s ease",
            }}>
              <p style={{
                color: "var(--purple)", fontSize: "0.72rem", fontWeight: 800,
                textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 12px",
              }}>✨ What you get:</p>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {(display as any).subscriberPerks.map((perk: string, i: number) => (
                  <li key={i} style={{
                    display: "flex", alignItems: "flex-start", gap: 8,
                    fontSize: "0.82rem", color: "var(--text)", fontWeight: 600, lineHeight: 1.3,
                  }}>
                    <span style={{ flexShrink: 0, color: "var(--purple)" }}>✓</span>
                    {perk}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Subscribe CTA — shown when monthly mode is selected */}
        {payMode === "monthly" && (
          <div style={{ marginBottom: 16 }}>
            <button
              onClick={handleSubscribeClick}
              disabled={submitting || !!display.vacationMode || (!!user && user.uid === display.uid)}
              style={{
                width: "100%", padding: "14px 0",
                background: isSubscribed
                  ? "linear-gradient(135deg, #10b981, #059669)"
                  : (user && user.uid === display.uid)
                  ? "#9ca3af"
                  : "linear-gradient(135deg, #7c3aed, #a855f7)",
                color: "#fff", border: "none", borderRadius: 12,
                fontWeight: 800, fontSize: "0.95rem",
                cursor: (submitting || display.vacationMode || (user && user.uid === display.uid)) ? "not-allowed" : "pointer",
                letterSpacing: "0.02em", transition: "opacity 0.2s",
                opacity: (submitting || display.vacationMode) ? 0.7 : 1,
              }}
            >
              {user && user.uid === display.uid
                ? "Your creator page"
                : isSubscribed
                ? "Go to Dashboard →"
                : !user
                ? "Sign Up & Subscribe →"
                : `Subscribe ${currencySymbol}${(((display.monthlyPrice || 0) * pppFactor) / 100).toFixed(2)}/mo →`}
            </button>
          </div>
        )}

        {/* Guarantee Info */}
        <div style={{
          padding: "16px", background: "rgba(245,158,11,0.05)",
          border: "1px solid #fde68a", borderRadius: 12,
          display: "flex", gap: 12, alignItems: "flex-start"
        }}>
          <span style={{ fontSize: "1.2rem" }}>⏳</span>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#92400e", lineHeight: 1.5 }}>
            <strong>Response Guarantee:</strong> Auto-refunded if not answered within {slaLabel}. No answer = no charge.
          </p>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════ */}
      {/* SECTION 5 — ASK A QUESTION                            */}
      {/* ══════════════════════════════════════════════════════ */}
      <div style={{ ...SECTION, background: "#fff" }} id="ask">
        <p style={SECTION_TITLE}>✉️ Ask a Question</p>
        {payMode === "monthly" && !isSubscribed && !(user && user.uid === display.uid) ? (
          <div style={{ textAlign: "center", padding: "32px 16px" }}>
            <div style={{ fontSize: "3rem", marginBottom: 16 }}>🌟</div>
            <h3 style={{ fontWeight: 800, fontSize: "1.25rem", color: "#1f2937", margin: "0 0 8px" }}>
              Subscribe to ask questions
            </h3>
            <p style={{ color: "#6b7280", fontSize: "0.9rem", lineHeight: 1.65, maxWidth: 340, margin: "0 auto 24px" }}>
              Get personal answers from <strong>{display.displayName}</strong> — subscribe monthly to unlock unlimited questions.
            </p>
            <button
              onClick={handleSubscribeClick}
              disabled={submitting}
              style={{
                padding: "14px 32px",
                background: "linear-gradient(135deg, #7c3aed, #a855f7)",
                color: "#fff", border: "none", borderRadius: 12,
                fontWeight: 800, fontSize: "0.95rem", cursor: "pointer",
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {!user ? "Sign Up & Subscribe →" : `Subscribe ${currencySymbol}${(((display.monthlyPrice || 0) * pppFactor) / 100).toFixed(2)}/mo →`}
            </button>
          </div>
        ) : (<>

        <h2 className="font-display" style={{ fontSize: "1.6rem", color: "var(--text)", margin: "0 0 20px", lineHeight: 1.2 }}>
          Get a personal answer from{" "}
          <span style={{ color: "var(--purple)" }}>{display.displayName}</span>
        </h2>

        {submitted ? (
          /* ── Success state ── */
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ fontSize: "3rem", marginBottom: 16 }}>✅</div>
            <h3 style={{ color: "var(--text)", margin: "0 0 8px", fontSize: "1.3rem", fontWeight: 800 }}>
              Question Sent!
            </h3>
            <p style={{ color: "var(--muted)", margin: "0 0 24px", fontSize: "0.9rem", lineHeight: 1.6 }}>
              <strong>{display.displayName}</strong> will respond to{" "}
              <strong>{email}</strong> within {slaLabel}.
            </p>
            <button
              onClick={() => { setSubmitted(false); setEmail(""); }}
              className="btn-premium btn-premium-purple"
              style={{ fontSize: "0.9rem", padding: "12px 24px" }}
            >
              Ask Another Question
            </button>
          </div>
        ) : (
          <form onSubmit={handleAsk} style={{ display: "flex", flexDirection: "column", gap: 14 }}>



            {/* Question composer */}
            <div>
              <label style={{ display: "block", color: "var(--muted)", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>
                Your Question <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <RichComposer
                value={question}
                onChange={setQuestion}
                onAttachmentsChange={setAttachments}
                placeholder="What do you want to ask? Be specific — you can paste links or drag files too 📎…"
                maxLength={500}
                disabled={submitting}
              />
            </div>

            {/* Name */}
            <div>
              <label style={{ display: "block", color: "var(--muted)", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>
                Your Name <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                className="input-brutal"
                type="text"
                placeholder="Your full name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>

            {/* Email */}
            <div>
              <label style={{ display: "block", color: "var(--muted)", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>
                Your Email (answer delivered here) <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                className="input-brutal"
                type="email"
                placeholder="you@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            {/* Price summary — only when Stripe is ready */}
            {display.stripeOnboardingComplete && (
              <div style={{
                background: "rgba(124,58,237,0.04)",
                border: "1.5px solid rgba(124,58,237,0.2)",
                borderRadius: 12, padding: "12px 16px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <span style={{ color: "var(--muted)", fontSize: "0.88rem" }}>
                  {isSubscribed && payMode === "monthly" ? "Included in your subscription" : (payMode === "one-time" ? "One-time payment" : "Monthly subscription")}
                </span>
                <span style={{ color: "var(--purple)", fontWeight: 900, fontSize: "1.15rem" }}>
                  {isSubscribed && payMode === "monthly" ? "FREE" : (
                    <>
                      ${((payMode === "one-time" ? (display.perQuestionPrice || 0) : (display.monthlyPrice || 0)) / 100).toFixed(2)}
                      {payMode === "monthly" && <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>/mo</span>}
                    </>
                  )}
                </span>
              </div>
            )}


            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || display.vacationMode}
              className={display.vacationMode ? "btn-disabled" : "btn-purple"}
              style={{ 
                width: "100%", 
                fontSize: "1.1rem", 
                fontWeight: "800",
                padding: "16px", 
                opacity: (submitting || display.vacationMode) ? 0.7 : 1,
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                cursor: display.vacationMode ? "not-allowed" : "pointer",
                background: display.vacationMode ? "#9ca3af" : undefined,
              }}
            >
              {display.vacationMode ? (
                "Temporarily Unavailable"
              ) : submitting ? (
                "Redirecting to payment…"
              ) : isSubscribed && payMode === "monthly" ? (
                "Send Question (Subscriber Perk) 🌟"
              ) : payMode === "one-time" ? (
                `Pay & Ask 💬 ${currencySymbol}${(((display.perQuestionPrice || 0) * pppFactor) / 100).toFixed(2)}`
              ) : (
                `Subscribe & Ask 🌟 ${currencySymbol}${(((display.monthlyPrice || 0) * pppFactor) / 100).toFixed(2)}/mo`
              )}
            </button>

            <p style={{ color: "var(--muted)", fontSize: "0.74rem", textAlign: "center", margin: 0 }}>
              Auto-refunded if not answered within {slaLabel}. Powered by Stripe. 🔒
            </p>
          </form>
        )}
        </>)}
      </div>

      {/* ══════════════════════════════════════════════════════ */}
      {/* BONUS — PUBLIC Q&A                                     */}
      {/* ══════════════════════════════════════════════════════ */}
      {publicQA.length > 0 && (
        <div id="public-qa" style={{ marginTop: 48 }}>
          <button
            type="button"
            onClick={() => setPublicQaCollapsed(c => !c)}
            aria-expanded={!publicQaCollapsed}
            aria-controls="public-qa-list"
            style={{
              display: "flex", alignItems: "center", gap: 12, marginBottom: 20,
              background: "none", border: "none", padding: 0, cursor: "pointer",
              width: "100%", textAlign: "left",
            }}
          >
            <span style={{
              background: "#ede9fe", color: "var(--purple)",
              borderRadius: 99, padding: "4px 16px",
              fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.06em",
              textTransform: "uppercase", border: "1px solid rgba(124,58,237,0.2)",
            }}>
              🌐 Public Q&amp;A
            </span>
            <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>
              {publicQA.length} answer{publicQA.length !== 1 ? "s" : ""} shared by {display.displayName}
            </span>
            <span style={{
              marginLeft: "auto", color: "var(--purple)", fontSize: "0.82rem", fontWeight: 700,
              display: "inline-flex", alignItems: "center", gap: 4,
            }}>
              {publicQaCollapsed ? "Show" : "Hide"} <span style={{ transform: publicQaCollapsed ? "rotate(0deg)" : "rotate(180deg)", transition: "transform 0.2s" }}>▾</span>
            </span>
          </button>

          {!publicQaCollapsed && (
          <div id="public-qa-list" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {publicQA.map((qa) => {
              const exp = qaExpanded[qa.id!];
              return (
                <div key={qa.id} style={{
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 16,
                  overflow: "hidden",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                }}>
                  {/* Question */}
                  <div style={{ background: "#f9fafb", borderBottom: "1.5px solid #e5e7eb", padding: "16px 20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <div>
                        <span style={{
                          display: "inline-block",
                          background: "#ede9fe", color: "var(--purple)",
                          borderRadius: 99, padding: "1px 10px",
                          fontSize: "0.68rem", fontWeight: 700,
                          marginBottom: 6, textTransform: "uppercase",
                        }}>❓ Question</span>
                        <p style={{ margin: 0, color: "#1f2937", fontWeight: 600, fontSize: "0.93rem", lineHeight: 1.6 }}>
                          {renderTextWithLinks(qa.content)}
                        </p>
                      </div>
                      <span style={{ color: "#9ca3af", fontSize: "0.74rem", whiteSpace: "nowrap", flexShrink: 0 }}>
                        {timeAgo(qa.answeredAt || qa.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Answer */}
                  <div style={{ padding: "16px 20px" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      background: "#dcfce7", color: "#166534",
                      borderRadius: 99, padding: "1px 10px",
                      fontSize: "0.68rem", fontWeight: 700,
                      marginBottom: 8, textTransform: "uppercase",
                    }}>✅ {display.displayName}&apos;s Answer</span>
                    <p style={{
                      margin: 0, color: "#374151", lineHeight: 1.75, fontSize: "0.93rem",
                      overflow: exp ? "visible" : "hidden",
                      display: exp ? "block" : "-webkit-box",
                      WebkitLineClamp: exp ? undefined : 4,
                      WebkitBoxOrient: "vertical" as const,
                    }}>
                      {qa.response ? renderTextWithLinks(qa.response) : ""}
                    </p>
                    {(qa.response?.length ?? 0) > 280 && (
                      <button
                        onClick={() => setQaExpanded(prev => ({ ...prev, [qa.id!]: !prev[qa.id!] }))}
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          color: "var(--purple)", fontWeight: 700, fontSize: "0.8rem",
                          padding: 0, marginTop: 8, display: "block",
                        }}
                      >
                        {exp ? "Show less ▲" : "Read full answer ▼"}
                      </button>
                    )}
                    {qa.answerUrl && (
                      <a href={qa.answerUrl} target="_blank" rel="noopener noreferrer"
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          marginTop: 10, color: "var(--purple)", fontWeight: 700, fontSize: "0.83rem",
                          background: "#ede9fe", borderRadius: 99, padding: "4px 14px",
                          textDecoration: "none", border: "1px solid rgba(124,58,237,0.2)",
                        }}>
                        🔗 View attached resource
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          )}

          <div style={{
            marginTop: 28, textAlign: "center",
            border: "1.5px solid rgba(124,58,237,0.15)",
            borderRadius: 20, padding: "28px 24px",
            background: "linear-gradient(135deg, #faf5ff, #fff)",
            boxShadow: "0 6px 24px rgba(124,58,237,0.1)",
          }}>
            <p style={{ fontWeight: 800, fontSize: "1.05rem", marginBottom: 4, color: "var(--text)" }}>
              Want a personalised answer?
            </p>
            <p style={{ color: "var(--muted)", fontSize: "0.88rem", marginBottom: 16 }}>
              Ask {display.displayName} your own question — answered within {slaLabel}.
            </p>
            <button
              onClick={() => document.getElementById("ask")?.scrollIntoView({ behavior: "smooth" })}
              className="btn-brutal btn-purple"
              style={{ padding: "12px 28px", fontSize: "0.9rem" }}
            >
              Ask Now ↑
            </button>
          </div>
        </div>
      )}
    </div>

    {/* POWERED-BY FOOTER */}
    <footer style={{
      borderTop: "1.5px solid #f3f4f6",
      padding: "20px 24px",
      textAlign: "center",
      marginTop: 16,
    }}>
      <p style={{ fontFamily: "'Inter', sans-serif", color: "#9ca3af", fontSize: "0.78rem", margin: 0 }}>
        Powered by{" "}
        <a href="/" style={{ color: "#7c3aed", fontWeight: 700, textDecoration: "none" }}>AskExpert</a>
        {" "}&mdash; get paid to answer questions from your audience.
      </p>
    </footer>
    </>
  );
}
