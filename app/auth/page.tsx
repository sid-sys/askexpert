"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

// ── Eye icon (show/hide password) ──────────────────────────────────────────
function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

type View = "login" | "signup" | "forgot";

function AuthForm() {
  const searchParams = useSearchParams();
  const [view, setView] = useState<View>(
    searchParams.get("mode") === "signup" ? "signup" : "login"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [username, setUsername] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [verificationSent, setVerificationSent] = useState(false);

  // Read ?plan= from URL ("creator" | "pro" | null)
  const selectedPlan = searchParams.get("plan")?.toLowerCase() ?? "";
  const PAID_PLANS = ["creator", "pro"];

  /** After signup, redirect to Stripe if a paid plan was selected */
  const redirectToPlanCheckout = async (uid: string, userEmail: string, plan: string) => {
    if (!PAID_PLANS.includes(plan)) return;
    try {
      const res = await fetch("/api/stripe/create-subscription-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, email: userEmail, plan }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url; // hand off to Stripe hosted checkout
      }
    } catch {
      console.error("[auth] subscription checkout redirect failed");
    }
  };

  const { signInWithGoogle, signInWithEmail, signUpWithEmail, sendPasswordReset, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.push("/dashboard");
  }, [user, router]);

  // ── Login ────────────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await signInWithEmail(email, password);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(friendlyError(err));
    } finally { setLoading(false); }
  };

  // ── Sign Up ──────────────────────────────────────────────────────────────
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!username.trim()) { setError("Username is required"); return; }
    if (!/^[a-z0-9_]{3,24}$/.test(username.trim().toLowerCase())) {
      setError("Username: 3-24 chars, lowercase letters, numbers and underscores only");
      return;
    }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (password !== confirmPassword) { setError("Passwords do not match"); return; }
    setLoading(true);
    try {
      await signUpWithEmail(email, password, username.trim().toLowerCase());
      if (selectedPlan && PAID_PLANS.includes(selectedPlan)) {
        const firebaseModule = await import("@/lib/firebase");
        const u = firebaseModule.auth.currentUser;
        if (u) {
          await redirectToPlanCheckout(u.uid, email, selectedPlan);
          return;
        }
      }
      setVerificationSent(true);
    } catch (err: unknown) {
      setError(friendlyError(err));
    } finally { setLoading(false); }
  };

  // ── Forgot Password ──────────────────────────────────────────────────────
  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await sendPasswordReset(email);
      setSuccess("Password reset email sent! Check your inbox.");
    } catch (err: unknown) {
      setError(friendlyError(err));
    } finally { setLoading(false); }
  };

  // ── Google ───────────────────────────────────────────────────────────────
  const handleGoogle = async () => {
    setError(""); setLoading(true);
    try {
      await signInWithGoogle();
      const firebaseModule = await import("@/lib/firebase");
      const u = firebaseModule.auth.currentUser;
      if (u && selectedPlan && PAID_PLANS.includes(selectedPlan)) {
        await redirectToPlanCheckout(u.uid, u.email ?? "", selectedPlan);
      } else {
        router.push("/dashboard");
      }
    } catch (err: unknown) {
      setError(friendlyError(err));
    } finally { setLoading(false); }
  };

  const goTo = (v: View) => {
    setError(""); setSuccess(""); setVerificationSent(false);
    setView(v);
  };

  // ── Verification sent screen ─────────────────────────────────────────────
  if (verificationSent) {
    return (
      <div style={pageWrap}>
        <div style={{ width: "100%", maxWidth: 440 }}>
          <div style={card}>
            <div style={{ textAlign: "center", padding: "8px 0 24px" }}>
              <div style={{ fontSize: "3.5rem", marginBottom: 16 }}>📧</div>
              <h2 style={heading}>Check your inbox</h2>
              <p style={{ color: "#6b7280", marginTop: 8, lineHeight: 1.6 }}>
                We&apos;ve sent a verification link to{" "}
                <strong style={{ color: "#7c3aed" }}>{email}</strong>.
                <br />Click the link to activate your account.
              </p>
            </div>
            <div style={{
              background: "#f5f3ff",
              border: "1px solid #ede9fe",
              borderRadius: 12,
              padding: "14px 16px",
              marginBottom: 20,
            }}>
              <p style={{ color: "#5b21b6", fontSize: "0.82rem", fontWeight: 600, margin: 0 }}>
                💡 Tip: Check your spam folder if you don&apos;t see it within a minute.
              </p>
            </div>
            <button
              onClick={() => goTo("login")}
              style={btnPurple}
            >
              Back to Login →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page" style={pageWrap}>
      {/* Background orbs */}
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", zIndex: 0, pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "10%", left: "15%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(124,58,237,0.15), transparent 70%)", filter: "blur(60px)" }} />
        <div style={{ position: "absolute", bottom: "15%", right: "10%", width: 350, height: 350, borderRadius: "50%", background: "radial-gradient(circle, rgba(16,185,129,0.1), transparent 70%)", filter: "blur(60px)" }} />
      </div>

      <div className="auth-card-wrap" style={{ width: "100%", maxWidth: 460, position: "relative", zIndex: 1 }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <a href="/" style={{ textDecoration: "none" }}>
            <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "1.8rem", background: "linear-gradient(135deg, #7c3aed, #a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              AskExpert
            </span>
          </a>
          <p style={{ color: "#9ca3af", fontSize: "0.85rem", marginTop: 6 }}>
            {view === "login"
              ? "Welcome back — sign in to your account"
              : view === "signup"
              ? "Join AskExpert — start monetising your knowledge"
              : "Reset your password"}
          </p>
        </div>

        <div className="auth-card" style={card}>

          {/* ── Tab switcher (login / signup) ── */}
          {view !== "forgot" && (
            <div style={{
              display: "flex",
              background: "#f3f4f6",
              borderRadius: 12,
              padding: 4,
              marginBottom: 28,
              gap: 4,
            }}>
              {(["login", "signup"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => goTo(v)}
                  style={{
                    flex: 1,
                    padding: "10px 0",
                    borderRadius: 9,
                    border: "none",
                    fontWeight: 700,
                    fontSize: "0.88rem",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    background: view === v ? "#fff" : "transparent",
                    color: view === v ? "#7c3aed" : "#9ca3af",
                    boxShadow: view === v ? "0 1px 6px rgba(0,0,0,0.1)" : "none",
                  }}
                >
                  {v === "login" ? "Sign In" : "Create Account"}
                </button>
              ))}
            </div>
          )}

          {/* ── Google ── */}
          {view !== "forgot" && (
            <>
              <button onClick={handleGoogle} disabled={loading} style={btnGoogle}>
                <svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                Continue with Google
              </button>
              <div style={divider}>
                <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
                <span style={{ color: "#9ca3af", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", padding: "0 12px" }}>or</span>
                <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
              </div>
            </>
          )}

          {/* ════════════════ LOGIN FORM ════════════════ */}
          {view === "login" && (
            <form onSubmit={handleLogin} style={formWrap}>
              <Field label="Email address">
                <input id="auth-email" className="input-brutal" type="email" placeholder="you@domain.com"
                  value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} required autoComplete="email" />
              </Field>
              <Field label="Password">
                <div style={pwWrap}>
                  <input id="auth-password" className="input-brutal" type={showPw ? "text" : "password"} placeholder="••••••••"
                    value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} required style={{ paddingRight: 44 }} />
                  <button type="button" onClick={() => setShowPw(!showPw)} style={eyeBtn} tabIndex={-1}>
                    <EyeIcon open={showPw} />
                  </button>
                </div>
              </Field>
              <div style={{ textAlign: "right", marginTop: -8 }}>
                <button type="button" onClick={() => goTo("forgot")}
                  style={{ background: "none", border: "none", color: "#7c3aed", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer" }}>
                  Forgot password?
                </button>
              </div>

              {error && <ErrorBox msg={error} />}
              <button type="submit" disabled={loading} style={{ ...btnPurple, opacity: loading ? 0.7 : 1 }}>
                {loading ? "Signing in…" : "Sign In →"}
              </button>
            </form>
          )}

          {/* ════════════════ SIGNUP FORM ════════════════ */}
          {view === "signup" && (
            <form onSubmit={handleSignUp} style={formWrap}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="Username">
                  <input id="auth-username" className="input-brutal" type="text" placeholder="your-handle"
                    value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username" />
                </Field>
                <Field label="Email address">
                  <input id="auth-email-su" className="input-brutal" type="email" placeholder="you@domain.com"
                    value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                </Field>
              </div>
              <Field label="Password">
                <div style={pwWrap}>
                  <input id="auth-pw-su" className="input-brutal" type={showPw ? "text" : "password"} placeholder="Min 8 characters"
                    value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} style={{ paddingRight: 44 }} />
                  <button type="button" onClick={() => setShowPw(!showPw)} style={eyeBtn} tabIndex={-1}>
                    <EyeIcon open={showPw} />
                  </button>
                </div>
              </Field>
              <Field label="Confirm password">
                <div style={pwWrap}>
                  <input id="auth-confirm-pw" className="input-brutal" type={showConfirmPw ? "text" : "password"} placeholder="Repeat password"
                    value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required style={{ paddingRight: 44 }} />
                  <button type="button" onClick={() => setShowConfirmPw(!showConfirmPw)} style={eyeBtn} tabIndex={-1}>
                    <EyeIcon open={showConfirmPw} />
                  </button>
                </div>
              </Field>

              {/* Password strength indicator */}
              {password.length > 0 && (
                <div style={{ display: "flex", gap: 4 }}>
                  {[1, 2, 3, 4].map((n) => (
                    <div key={n} style={{
                      flex: 1, height: 3, borderRadius: 99,
                      background: strengthScore(password) >= n
                        ? ["#ef4444", "#f59e0b", "#10b981", "#7c3aed"][strengthScore(password) - 1]
                        : "#e5e7eb",
                      transition: "background 0.3s",
                    }} />
                  ))}
                  <span style={{ fontSize: "0.7rem", color: "#9ca3af", minWidth: 48, textAlign: "right" }}>
                    {["", "Weak", "Fair", "Good", "Strong"][strengthScore(password)]}
                  </span>
                </div>
              )}

              {/* Admin badge detection */}
              {email.toLowerCase() === "sidharthbabu9@gmail.com" && (
                <div style={{
                  background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
                  borderRadius: 12, padding: "10px 16px",
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <span style={{ fontSize: "1.2rem" }}>👑</span>
                  <span style={{ color: "#fff", fontWeight: 700, fontSize: "0.82rem" }}>
                    Admin account detected — you&apos;ll receive creator + admin privileges.
                  </span>
                </div>
              )}

              {error && <ErrorBox msg={error} />}
              <button type="submit" disabled={loading} style={{ ...btnPurple, opacity: loading ? 0.7 : 1 }}>
                {loading ? "Creating account…" : "Create Account & Verify Email →"}
              </button>
              <p style={{ color: "#9ca3af", fontSize: "0.72rem", textAlign: "center" }}>
                By signing up you agree to our Terms of Service and Privacy Policy.
              </p>
            </form>
          )}

          {/* ════════════════ FORGOT PASSWORD ════════════════ */}
          {view === "forgot" && (
            <form onSubmit={handleForgot} style={formWrap}>
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <div style={{ fontSize: "2.5rem", marginBottom: 10 }}>🔑</div>
                <h2 style={{ ...heading, fontSize: "1.4rem" }}>Forgot your password?</h2>
                <p style={{ color: "#6b7280", fontSize: "0.85rem", marginTop: 6, lineHeight: 1.5 }}>
                  Enter your email and we&apos;ll send you a reset link immediately.
                </p>
              </div>
              <Field label="Email address">
                <input id="forgot-email" className="input-brutal" type="email" placeholder="you@domain.com"
                  value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </Field>
              {error && <ErrorBox msg={error} />}
              {success && (
                <div style={{
                  background: "#f0fdf4", border: "1px solid #bbf7d0",
                  borderRadius: 10, padding: "12px 14px",
                  color: "#166534", fontSize: "0.85rem", fontWeight: 600,
                }}>
                  ✅ {success}
                </div>
              )}
              {!success && (
                <button type="submit" disabled={loading} style={{ ...btnPurple, opacity: loading ? 0.7 : 1 }}>
                  {loading ? "Sending…" : "Send Reset Link →"}
                </button>
              )}
              <button type="button" onClick={() => goTo("login")}
                style={{ background: "none", border: "none", color: "#7c3aed", fontWeight: 600,
                  fontSize: "0.85rem", cursor: "pointer", textAlign: "center", width: "100%" }}>
                ← Back to Sign In
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", color: "#6b7280", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div style={{
      background: "#fef2f2", border: "1px solid #fecaca",
      borderRadius: 10, padding: "11px 14px",
      color: "#dc2626", fontSize: "0.84rem", fontWeight: 600,
    }}>
      ⚠️ {msg}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("email-already-in-use")) return "This email is already registered. Try logging in instead.";
  if (msg.includes("wrong-password") || msg.includes("invalid-credential")) return "Incorrect email or password.";
  if (msg.includes("user-not-found")) return "No account found with this email.";
  if (msg.includes("too-many-requests")) return "Too many attempts. Please wait a few minutes.";
  if (msg.includes("weak-password")) return "Password must be at least 8 characters.";
  if (msg.includes("invalid-email")) return "Please enter a valid email address.";
  if (msg.includes("network-request-failed")) return "Network error. Check your connection.";
  if (msg.includes("popup-closed-by-user") || msg.includes("popup_closed_by_user")) return "Google sign-in was cancelled. Try again or use email/password.";
  return msg;
}

function strengthScore(pw: string): number {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

// ── Style objects ─────────────────────────────────────────────────────────────
const pageWrap: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "40px 20px",
  background: "#fafafa",
  position: "relative",
};

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 20,
  padding: "32px 32px 28px",
  boxShadow: "0 4px 40px rgba(0,0,0,0.07)",
};

const formWrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 18,
};

const heading: React.CSSProperties = {
  fontFamily: "'Syne', sans-serif",
  fontWeight: 800,
  fontSize: "1.6rem",
  color: "#111827",
};

const btnPurple: React.CSSProperties = {
  width: "100%",
  padding: "14px 0",
  background: "linear-gradient(135deg, #7c3aed, #a855f7)",
  color: "#fff",
  border: "none",
  borderRadius: 12,
  fontWeight: 800,
  fontSize: "0.95rem",
  cursor: "pointer",
  transition: "opacity 0.2s, transform 0.15s",
  letterSpacing: "0.02em",
};

const btnGoogle: React.CSSProperties = {
  width: "100%",
  padding: "12px 0",
  background: "#fff",
  color: "#374151",
  border: "1.5px solid #e5e7eb",
  borderRadius: 12,
  fontWeight: 700,
  fontSize: "0.9rem",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  marginBottom: 20,
  transition: "background 0.15s",
};

const divider: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  marginBottom: 20,
};

const pwWrap: React.CSSProperties = { position: "relative" };

const eyeBtn: React.CSSProperties = {
  position: "absolute",
  right: 12,
  top: "50%",
  transform: "translateY(-50%)",
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "#9ca3af",
  display: "flex",
  alignItems: "center",
  padding: 0,
};

// ── Page export ───────────────────────────────────────────────────────────────
export default function AuthPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ color: "#7c3aed", fontWeight: 700 }}>Loading…</div>
      </div>
    }>
      <AuthForm />
    </Suspense>
  );
}
