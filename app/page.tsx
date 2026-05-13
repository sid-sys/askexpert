"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { useCreatorCountLabel } from "@/lib/use-creator-count";

const FEATURES = [
  {
    icon: "💬",
    title: "Simple Q&A Links",
    desc: "Get your personal link in minutes. Share it anywhere — Instagram bio, Twitter, YouTube description.",
    variant: "purple",
  },
  {
    icon: "💸",
    title: "Set Your Own Rate",
    desc: "You decide what your time is worth. Charge $5 or $500 per answer — completely up to you.",
    variant: "yellow",
  },
  {
    icon: "⚡",
    title: "Get Paid Instantly",
    desc: "Payments land in your account the moment you answer. No waiting, no minimum payout threshold.",
    variant: "dark",
  },
];

const HOW_IT_WORKS = [
  { step: "01", title: "Create your profile", desc: "Sign up and set up your expert profile in under 3 minutes." },
  { step: "02", title: "Set your price", desc: "Choose how much you charge per question. Update anytime." },
  { step: "03", title: "Share your link", desc: "Post your AskExpert link everywhere your audience follows you." },
  { step: "04", title: "Get paid to answer", desc: "Answer questions on your schedule and watch payments roll in." },
];

const STATS = [
  { value: "10,000+", label: "Questions Answered" },
  { value: "$250K+", label: "Paid to Creators" },
  { value: "4.9★", label: "Average Rating" },
  { value: "3 min", label: "Setup Time" },
];

const TESTIMONIALS = [
  {
    avatar: "https://i.pravatar.cc/80?img=1",
    name: "Sarah Chen",
    role: "Fitness Coach",
    text: "I made $1,200 in my first week. My followers already wanted my advice — AskExpert just made it easy to get paid for it.",
  },
  {
    avatar: "https://i.pravatar.cc/80?img=2",
    name: "Marcus Reid",
    role: "Financial Advisor",
    text: "The setup was shockingly simple. I had my link live before my morning coffee was done.",
  },
  {
    avatar: "https://i.pravatar.cc/80?img=3",
    name: "Priya Sharma",
    role: "UX Designer",
    text: "Finally a platform that respects my time. I answer when I want, charge what I want, done.",
  },
];

export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const expertCountLabel = useCreatorCountLabel();

  useEffect(() => {
    if (!heroRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(".hero-item",
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, stagger: 0.12, duration: 0.9, ease: "power3.out", delay: 0.1 }
      );
      gsap.fromTo(".stat-card",
        { y: 20, opacity: 0, scale: 0.95 },
        { y: 0, opacity: 1, scale: 1, stagger: 0.08, duration: 0.6, ease: "back.out(1.4)", delay: 0.8 }
      );
    }, heroRef);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={heroRef} style={{ background: "#fff" }}>
      {/* ─── HERO ─── */}
      <section style={{ textAlign: "center", padding: "5rem 5% 5rem", position: "relative" }}>
        {/* Soft blobs */}
        <div style={{ position: "absolute", top: -100, left: "30%", width: 400, height: 400, background: "#f5f3ff", borderRadius: "50%", filter: "blur(80px)", opacity: 0.7, zIndex: 0, pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: 100, right: "10%", width: 250, height: 250, background: "#fffbeb", borderRadius: "50%", filter: "blur(60px)", opacity: 0.8, zIndex: 0, pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          {/* Badge */}
          <div className="hero-item" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#f5f3ff", border: "1px solid rgba(124,58,237,0.2)", borderRadius: 99, padding: "0.45rem 1rem", marginBottom: "1.5rem" }}>
            <span style={{ fontSize: "0.85rem", color: "#7c3aed", fontWeight: 600, fontFamily: "'Inter', sans-serif" }}>✨ Now live — join {expertCountLabel} experts</span>
          </div>

          {/* Headline */}
          <h1 className="hero-item" style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: "clamp(2.5rem, 6vw, 4.5rem)",
            fontWeight: 800,
            color: "#1f2937",
            maxWidth: 860,
            margin: "0 auto 1.5rem",
            lineHeight: 1.1,
          }}>
            Your Knowledge{" "}
            <span style={{ position: "relative", display: "inline-block" }}>
              <span style={{ color: "#7c3aed", fontFamily: "'Caveat', cursive", fontSize: "1.1em" }}>Has Value</span>
              <svg style={{ position: "absolute", bottom: -4, left: "-5%", width: "110%", height: 14, overflow: "visible", zIndex: -1 }} viewBox="0 0 220 14" fill="none">
                <path d="M4 10 Q55 2 110 8 Q165 14 216 6" stroke="#fbbf24" strokeWidth="3.5" strokeLinecap="round" fill="none" strokeDasharray="400" strokeDashoffset="0" />
              </svg>
            </span>
          </h1>

          <p className="hero-item" style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: "1.2rem",
            color: "#6b7280",
            maxWidth: 560,
            margin: "0 auto 2.5rem",
            lineHeight: 1.7,
          }}>
            Set your rate, share your link, and get paid for answering questions. The simplest way to monetize your audience's curiosity.
          </p>

          {/* CTA buttons */}
          <div className="hero-item hero-cta-row" style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/signup" style={{
              background: "#7c3aed",
              color: "#fff",
              borderRadius: "99px",
              padding: "1rem 2.2rem",
              fontFamily: "'Inter', sans-serif",
              fontWeight: 700,
              fontSize: "1.05rem",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              transition: "transform 0.3s, box-shadow 0.3s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 10px 25px rgba(124,58,237,0.4)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.transform = "";
              (e.currentTarget as HTMLElement).style.boxShadow = "";
            }}>
              Start Earning Free →
            </Link>
            <Link href="#how-it-works" style={{
              background: "#fff",
              color: "#1f2937",
              borderRadius: "99px",
              padding: "1rem 2rem",
              fontFamily: "'Inter', sans-serif",
              fontWeight: 600,
              fontSize: "1.05rem",
              textDecoration: "none",
              border: "1.5px solid #e5e7eb",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              transition: "border-color 0.2s, color 0.2s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = "#7c3aed";
              (e.currentTarget as HTMLElement).style.color = "#7c3aed";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = "#e5e7eb";
              (e.currentTarget as HTMLElement).style.color = "#1f2937";
            }}>
              See how it works
            </Link>
          </div>

          {/* Avatar stack */}
          <div className="hero-item" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: "2.5rem" }}>
            <div style={{ display: "flex" }}>
              {[1,2,3,4,5].map(i => (
                <img key={i} src={`https://i.pravatar.cc/40?img=${i+10}`}
                  className="avatar-hover"
                  style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #fff", marginLeft: i === 1 ? 0 : -12, objectFit: "cover" }}
                  alt="" />
              ))}
            </div>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.9rem", color: "#6b7280", fontWeight: 500 }}>
              <strong style={{ color: "#1f2937" }}>{expertCountLabel}</strong> creators earning today
            </span>
          </div>
        </div>
      </section>

      {/* ─── STATS ─── */}
      <section style={{ padding: "0 5% 5rem" }}>
        <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1.25rem", maxWidth: 900, margin: "0 auto" }}>
          {STATS.map((s, i) => (
            <div key={i} className="stat-card" style={{
              textAlign: "center",
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: "20px",
              padding: "1.5rem",
              boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
              transition: "transform 0.2s, box-shadow 0.2s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 24px rgba(0,0,0,0.08)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.transform = "";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.05)";
            }}>
              <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "2rem", fontWeight: 800, color: "#7c3aed", lineHeight: 1, marginBottom: "0.4rem" }}>{s.value}</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.82rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section id="features" style={{ background: "#fff", padding: "6rem 5%" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ marginBottom: "3.5rem" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#f5f3ff", border: "1px solid rgba(124,58,237,0.2)", borderRadius: 99, padding: "0.4rem 1rem", marginBottom: "1rem" }}>
              <span style={{ fontSize: "0.8rem", color: "#7c3aed", fontWeight: 600, fontFamily: "'Inter', sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" }}>Features</span>
            </div>
            <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "clamp(1.8rem, 3vw, 3rem)", fontWeight: 800, color: "#1f2937", marginBottom: "0.75rem" }}>
              Everything you need to get paid
            </h2>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "1.1rem", color: "#6b7280", maxWidth: 500 }}>
              We built the simplest expert platform on the internet. No complexity, just results.
            </p>
          </div>

          <div className="features-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem" }}>
            {FEATURES.map((f, i) => (
              <div key={i} style={{
                borderRadius: "40px",
                padding: "2.5rem",
                transition: "transform 0.3s",
                cursor: "default",
                background: f.variant === "purple" ? "#f5f3ff" : f.variant === "yellow" ? "#fffbeb" : "#7c3aed",
                color: f.variant === "dark" ? "#fff" : "#1f2937",
                border: f.variant === "dark" ? "none" : `1px solid ${f.variant === "purple" ? "rgba(124,58,237,0.15)" : "#fef3c7"}`,
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = "scale(1.02)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = ""}>
                <div style={{
                  background: "#fff",
                  borderRadius: "12px",
                  width: 50,
                  height: 50,
                  display: "grid",
                  placeItems: "center",
                  fontSize: "1.4rem",
                  marginBottom: "1.5rem",
                  boxShadow: "0 4px 10px rgba(0,0,0,0.06)",
                  color: "#7c3aed",
                }}>{f.icon}</div>
                <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "1.6rem", fontWeight: 700, marginBottom: "0.75rem" }}>{f.title}</h3>
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "1rem", lineHeight: 1.65, opacity: f.variant === "dark" ? 0.85 : 1, color: f.variant === "dark" ? "#fff" : "#6b7280" }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section id="how-it-works" style={{ background: "#fafafa", padding: "6rem 5%", borderTop: "1px solid #e5e7eb" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
            <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "clamp(1.8rem, 3vw, 2.8rem)", fontWeight: 800, color: "#1f2937", marginBottom: "0.75rem" }}>
              Up and running in{" "}
              <span style={{ fontFamily: "'Caveat', cursive", color: "#7c3aed", fontSize: "1.1em" }}>minutes</span>
            </h2>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "1.1rem", color: "#6b7280" }}>No complex setup. No waiting. Just four easy steps.</p>
          </div>
          <div className="steps-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "2rem" }}>
            {HOW_IT_WORKS.map((step, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: "2.5rem",
                  fontWeight: 800,
                  color: "rgba(124,58,237,0.15)",
                  lineHeight: 1,
                  marginBottom: "1rem",
                }}>{step.step}</div>
                <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "1.15rem", fontWeight: 700, color: "#1f2937", marginBottom: "0.5rem" }}>{step.title}</h3>
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.95rem", color: "#6b7280", lineHeight: 1.6 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── TESTIMONIALS ─── */}
      <section style={{ background: "#fff", padding: "6rem 5%", borderTop: "1px solid #e5e7eb" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "3rem" }}>
            <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "clamp(1.8rem, 3vw, 2.8rem)", fontWeight: 800, color: "#1f2937" }}>
              Experts love it
            </h2>
          </div>
          <div className="testimonials-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem" }}>
            {TESTIMONIALS.map((t, i) => (
              <div key={i} style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: "28px",
                padding: "2rem",
                boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
                transition: "transform 0.2s, box-shadow 0.2s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 12px 32px rgba(0,0,0,0.1)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = "";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.05)";
              }}>
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "1rem", color: "#374151", lineHeight: 1.7, marginBottom: "1.5rem" }}>"{t.text}"</p>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <img src={t.avatar} style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }} alt={t.name} />
                  <div>
                    <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, color: "#1f2937", fontSize: "0.95rem" }}>{t.name}</div>
                    <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.82rem", color: "#9ca3af" }}>{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA / WAITLIST ─── */}
      <section style={{
        background: "#7c3aed",
        color: "#fff",
        borderRadius: "60px 60px 0 0",
        padding: "6rem 5%",
        textAlign: "center",
      }}>
        <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 800, maxWidth: 640, margin: "0 auto 1rem" }}>
          Start earning from your expertise today
        </h2>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "1.1rem", opacity: 0.85, maxWidth: 480, margin: "0 auto 2.5rem", lineHeight: 1.65 }}>
          Join thousands of creators already monetizing their knowledge. Setup takes less than 3 minutes.
        </p>

        {/* Email capture */}
        {!submitted ? (
          <div style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: "20px",
            maxWidth: 520,
            margin: "0 auto",
            padding: "1.25rem",
            boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}>
            <input
              suppressHydrationWarning
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Enter your email address"
              style={{
                background: "#fafafa",
                border: "1.5px solid #e5e7eb",
                borderRadius: "12px",
                outline: "none",
                padding: "0.9rem 1.2rem",
                fontFamily: "'Inter', sans-serif",
                fontSize: "1rem",
                color: "#1f2937",
                width: "100%",
              }}
              onFocus={e => e.target.style.borderColor = "#7c3aed"}
              onBlur={e => e.target.style.borderColor = "#e5e7eb"}
            />
            <Link href="/signup" style={{
              background: "#7c3aed",
              color: "#fff",
              border: "none",
              borderRadius: "12px",
              padding: "1rem 2rem",
              fontFamily: "'Inter', sans-serif",
              fontSize: "1rem",
              fontWeight: 700,
              cursor: "pointer",
              textDecoration: "none",
              display: "block",
              textAlign: "center",
              transition: "opacity 0.2s, transform 0.2s",
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.9"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}>
              Create My Expert Profile →
            </Link>
          </div>
        ) : (
          <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "1.2rem", fontWeight: 700, color: "#fff", opacity: 0.9 }}>
            🎉 You're on the list! We'll be in touch soon.
          </div>
        )}

        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.85rem", opacity: 0.6, marginTop: "1rem" }}>Free to join. No credit card required.</p>
      </section>

      {/* ─── PRICING ─── */}
      <section id="pricing" style={{
        background: "#fafafa",
        padding: "6rem 5%",
        borderTop: "1.5px solid #e5e7eb",
      }}>
        <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
          <span style={{
            display: "inline-block",
            background: "rgba(124,58,237,0.08)",
            color: "#7c3aed",
            border: "1.5px solid rgba(124,58,237,0.25)",
            borderRadius: "999px",
            padding: "0.35rem 1rem",
            fontSize: "0.8rem",
            fontWeight: 700,
            fontFamily: "'Inter', sans-serif",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: "1rem",
          }}>Simple Pricing</span>
          <h2 style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: "clamp(2rem, 4vw, 3rem)",
            fontWeight: 900,
            color: "#1f2937",
            margin: "0 0 1rem",
            lineHeight: 1.1,
          }}>
            Keep more of what <span style={{ color: "#7c3aed" }}>you earn</span>
          </h2>
          <p style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: "1.1rem",
            color: "#6b7280",
            maxWidth: "520px",
            margin: "0 auto 2.5rem",
          }}>
            Start free. Upgrade when you're ready to scale. No hidden fees.
          </p>

        </div>

        {/* Pricing cards */}
        <div className="pricing-grid" style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "1.5rem",
          maxWidth: "960px",
          margin: "0 auto",
          alignItems: "start",
        }}>

          {/* FREE TIER */}
          {[
            {
              tier: "Free",
              price: "$0",
              period: "forever",
              fee: "20%",
              feeLabel: "platform fee per transaction",
              accent: "#6b7280",
              accentBg: "rgba(107,114,128,0.07)",
              highlight: false,
              badge: null,
              perks: [
                "Public creator profile",
                "Unlimited questions",
                "Pay-per-question & monthly pricing",
                "Up to $1000 in monthly earnings"
              ],
              cta: "Get started free",
              ctaHref: "/signup",
            },
            {
              tier: "Creator",
              price: "$4.99",
              period: "per month",
              fee: "10%",
              feeLabel: "platform fee per transaction",
              accent: "#7c3aed",
              accentBg: "rgba(124,58,237,0.06)",
              highlight: true,
              badge: "Most Popular",
              perks: [
                "Everything in Free",
                "Custom profile branding & colors",
                "Priority email support",
                "Up to $10,000 in monthly earnings"
              ],
              cta: "Get started",
              ctaHref: "/signup?plan=creator",
            },
            {
              tier: "Pro",
              price: "$9.99",
              period: "per month",
              fee: "0%",
              feeLabel: "platform fee per transaction",
              accent: "#059669",
              accentBg: "rgba(5,150,105,0.06)",
              highlight: false,
              badge: null,
              perks: [
                "Everything in Creator",
                "Lowest platform fee (0%)",
                "Unlimited earnings",
                "Dedicated account manager",
              ],
              cta: "Get started",
              ctaHref: "/signup?plan=pro",
            },
          ].map((plan) => (
            <div key={plan.tier} style={{
              background: plan.highlight ? "#fff" : "#fff",
              border: plan.highlight ? "2.5px solid #7c3aed" : "1.5px solid #e5e7eb",
              borderRadius: "20px",
              padding: "2rem",
              position: "relative",
              boxShadow: plan.highlight
                ? "0 8px 40px rgba(124,58,237,0.15)"
                : "0 2px 12px rgba(0,0,0,0.04)",
              transform: plan.highlight ? "translateY(-8px)" : "none",
              transition: "transform 0.2s, box-shadow 0.2s",
            }}>
              {/* Badge */}
              {plan.badge && (
                <div style={{
                  position: "absolute",
                  top: "-14px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "#7c3aed",
                  color: "#fff",
                  borderRadius: "999px",
                  padding: "0.3rem 1rem",
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  fontFamily: "'Inter', sans-serif",
                  letterSpacing: "0.06em",
                  whiteSpace: "nowrap",
                }}>⭐ {plan.badge}</div>
              )}

              {/* Tier name */}
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                background: plan.accentBg,
                color: plan.accent,
                borderRadius: "8px",
                padding: "0.25rem 0.75rem",
                fontSize: "0.8rem",
                fontWeight: 700,
                fontFamily: "'Inter', sans-serif",
                marginBottom: "1.25rem",
              }}>{plan.tier}</div>

              {/* Price */}
              <div style={{ marginBottom: "0.5rem", minHeight: 60 }}>
                <span style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: "3rem",
                  fontWeight: 900,
                  color: "#1f2937",
                  lineHeight: 1,
                }}>{plan.price}</span>
                <span style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: "0.9rem",
                  color: "#9ca3af",
                  marginLeft: "0.4rem",
                }}>/{plan.period}</span>
              </div>

              {/* Fee callout */}
              <div style={{
                background: plan.accentBg,
                border: `1px solid ${plan.accent}30`,
                borderRadius: "10px",
                padding: "0.6rem 0.9rem",
                marginBottom: "1.5rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}>
                <span style={{ fontSize: "1.1rem" }}>✂️</span>
                <div>
                  <span style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: "1.4rem",
                    fontWeight: 900,
                    color: plan.accent,
                  }}>{plan.fee}</span>
                  <span style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: "0.75rem",
                    color: "#6b7280",
                    marginLeft: "0.3rem",
                  }}>{plan.feeLabel}</span>
                </div>
              </div>

              {/* Perks list */}
              <ul style={{
                listStyle: "none",
                padding: 0,
                margin: "0 0 1.75rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.55rem",
              }}>
                {plan.perks.map((p) => (
                  <li key={p} style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.5rem",
                    fontFamily: "'Inter', sans-serif",
                    fontSize: "0.9rem",
                    color: "#374151",
                  }}>
                    <span style={{ color: plan.accent, flexShrink: 0, marginTop: "1px" }}>✓</span>
                    {p}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Link href={plan.ctaHref} style={{
                display: "block",
                textAlign: "center",
                background: plan.highlight ? "#7c3aed" : "transparent",
                color: plan.highlight ? "#fff" : plan.accent,
                border: `2px solid ${plan.accent}`,
                borderRadius: "12px",
                padding: "0.85rem 1.5rem",
                fontFamily: "'Inter', sans-serif",
                fontSize: "0.95rem",
                fontWeight: 700,
                textDecoration: "none",
                transition: "opacity 0.2s, transform 0.15s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.opacity = "0.85";
                (e.currentTarget as HTMLElement).style.transform = "scale(1.02)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.opacity = "1";
                (e.currentTarget as HTMLElement).style.transform = "scale(1)";
              }}>
                {plan.cta} →
              </Link>
            </div>
          ))}
        </div>

        {/* Footnote */}
        <p style={{
          textAlign: "center",
          fontFamily: "'Inter', sans-serif",
          fontSize: "0.85rem",
          color: "#9ca3af",
          marginTop: "2.5rem",
        }}>
          💳 No credit card required to start.&nbsp; All plans include a free profile at <strong>askexpert.ink/yourname</strong>
        </p>
      </section>

    </div>
  );
}
