import { adminDb } from "@/lib/firebase-admin";
import { stripe } from "@/lib/stripe";
import { resend } from "@/lib/resend";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function checkStripe() {
  try {
    const balance = await stripe.balance.retrieve();
    return { ok: true, data: `${balance.available[0].amount} ${balance.available[0].currency}` };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

async function checkFirebase() {
  try {
    const snap = await adminDb.collection("users").limit(1).get();
    return { ok: true, data: `${snap.size} users found` };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

async function checkResend() {
  try {
    // We can't really "ping" Resend without sending, but we can check if the API key is set
    if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY missing");
    return { ok: true, data: "API Key configured" };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

export default async function HealthPage() {
  const stripeStatus = await checkStripe();
  const firebaseStatus = await checkFirebase();
  const resendStatus = await checkResend();

  const services = [
    { name: "Stripe", status: stripeStatus },
    { name: "Firebase Admin", status: firebaseStatus },
    { name: "Resend", status: resendStatus },
  ];

  return (
    <div style={{ padding: "40px", fontFamily: "sans-serif", maxWidth: "800px", margin: "0 auto" }}>
      <Link href="/admin" style={{ color: "#7c3aed", textDecoration: "none", marginBottom: "20px", display: "inline-block" }}>
        ← Back to Admin
      </Link>
      <h1 style={{ fontSize: "2rem", fontWeight: "bold", marginBottom: "32px" }}>System Health Check</h1>
      
      <div style={{ display: "grid", gap: "20px" }}>
        {services.map((s) => (
          <div key={s.name} style={{ 
            padding: "24px", 
            borderRadius: "16px", 
            border: "1px solid #e5e7eb",
            background: s.status.ok ? "#f0fdf4" : "#fef2f2",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: "700", margin: 0 }}>{s.name}</h2>
              <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: "0.9rem" }}>
                {s.status.ok ? s.status.data : s.status.error}
              </p>
            </div>
            <span style={{ 
              fontSize: "1.5rem",
              color: s.status.ok ? "#16a34a" : "#dc2626"
            }}>
              {s.status.ok ? "✅" : "❌"}
            </span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: "40px", padding: "20px", background: "#f9fafb", borderRadius: "12px", fontSize: "0.85rem", color: "#6b7280" }}>
        <strong>Environment:</strong> {process.env.NODE_ENV}<br />
        <strong>Timestamp:</strong> {new Date().toISOString()}
      </div>
    </div>
  );
}
