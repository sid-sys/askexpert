"use client";

import { reportBug } from "@/lib/report-bug";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getIdToken } from "firebase/auth";
import Swal from "sweetalert2";
import { useAuth } from "@/context/AuthContext";
import { collection, query, where, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Types derived from expected fields
interface Payout {
  id: string;
  creatorId: string;
  creatorEmail: string;
  amount: number; // in cents
  createdAt: any;
  status: "pending" | "paid" | "cancelled";
  paymentMethod?: string;
  bankDetails?: string;
  reference?: string;
  adminNotes?: string;
}

function fmt$( cents: number ) {
  return "$" + (cents / 100).toFixed(2);
}

function timeFmt( ts: any ): string {
  if (!ts) return "N/A";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function maskBank(details: string | undefined) {
  if (!details) return "N/A";
  if (details.includes("@")) {
    const [user, domain] = details.split("@");
    return `${user.substring(0, 2)}***@${domain}`;
  }
  const digits = details.replace(/\D/g, "");
  if (digits.length > 4) {
    return `***${digits.slice(-4)}`;
  }
  return "***";
}

export default function AdminPayoutsPage() {
  const { user, userProfile, loading } = useAuth();
  const router = useRouter();

  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "paid" | "cancelled">("pending");

  useEffect(() => {
    if (!loading && (!user || !userProfile?.isAdmin)) {
      router.replace("/dashboard");
    }
  }, [loading, user, userProfile, router]);

  // Live payouts via onSnapshot. Firestore rules (firestore.rules
  // pendingPayouts block) allow admin reads, so we can subscribe
  // straight from the client and new pendingPayouts rows surface in
  // real time without a manual refresh.
  useEffect(() => {
    if (!userProfile?.isAdmin) return;
    setDataLoading(true);
    const ref = collection(db, "pendingPayouts");
    const q = filter === "all"
      ? query(ref, orderBy("createdAt", "desc"), limit(100))
      : query(ref, where("status", "==", filter), orderBy("createdAt", "desc"), limit(100));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            ...data,
            createdAt:   data.createdAt,
            paidAt:      data.paidAt ?? null,
            cancelledAt: data.cancelledAt ?? null,
          } as Payout;
        });
        setPayouts(rows);
        setDataLoading(false);
      },
      (err) => {
        console.error("Failed to subscribe to payouts:", err);
        reportBug({ error: err, context: "app/admin/payouts/page.tsx" });
        setDataLoading(false);
      },
    );
    return () => unsub();
  }, [userProfile, filter]);

  const handleMarkPaid = async (payout: Payout) => {
    const { value: refInput } = await Swal.fire({
      title: 'Mark as Paid',
      input: 'text',
      inputLabel: 'Reference / Transaction ID (Wise, PayPal, etc.)',
      inputPlaceholder: 'Enter reference number...',
      showCancelButton: true,
      confirmButtonText: 'Confirm Paid',
      confirmButtonColor: '#10b981',
      inputValidator: (value) => {
        if (!value) return 'You need to provide a reference!'
      }
    });

    if (refInput) {
      setDataLoading(true);
      try {
        const idToken = await getIdToken(user!);
        const res = await fetch("/api/admin/payouts", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}` 
          },
          body: JSON.stringify({
            payoutId: payout.id,
            status: "paid",
            reference: refInput
          })
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to mark as paid");
        }

        setPayouts(prev => prev.map(p => p.id === payout.id ? { ...p, status: "paid", reference: refInput } : p));
        Swal.fire('Success', 'Payout marked as paid and creator notified.', 'success');
      } catch (err: any) {
        reportBug({ error: err, context: "app/admin/payouts/page.tsx" });
      } finally {
        setDataLoading(false);
      }
    }
  };

  const handleCancel = async (payout: Payout) => {
    const { value: reason } = await Swal.fire({
      title: 'Cancel Payout?',
      text: "Provide a reason for rejection (optional but recommended).",
      input: 'textarea',
      inputPlaceholder: 'e.g. Invalid bank details...',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'Yes, reject it!'
    });

    if (reason !== undefined) {
      setDataLoading(true);
      try {
        const idToken = await getIdToken(user!);
        const res = await fetch("/api/admin/payouts", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}` 
          },
          body: JSON.stringify({
            payoutId: payout.id,
            status: "cancelled",
            reason: reason || "No specific reason provided."
          })
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to cancel payout");
        }

        setPayouts(prev => prev.map(p => p.id === payout.id ? { ...p, status: "cancelled", adminNotes: reason } : p));
        Swal.fire('Rejected!', 'Payout has been rejected and creator notified.', 'success');
      } catch (err: any) {
        reportBug({ error: err, context: "app/admin/payouts/page.tsx" });
      } finally {
        setDataLoading(false);
      }
    }
  };

  const handleResendNotification = async (payout: Payout) => {
    setDataLoading(true);
    try {
      const idToken = await getIdToken(user!);
      const res = await fetch("/api/admin/payouts", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}` 
        },
        body: JSON.stringify({
          payoutId: payout.id,
          action: "resend"
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to resend email");
      }

      Swal.fire('Resent!', 'Notification email has been sent again.', 'success');
    } catch (err: any) {
      reportBug({ error: err, context: "app/admin/payouts/page.tsx" });
    } finally {
      setDataLoading(false);
    }
  };

  if (loading || !userProfile || !userProfile.isAdmin) return null;

  const filtered = filter === "all" ? payouts : payouts.filter(p => p.status === filter);

  return (
    <div style={{ minHeight: "100vh", background: "#f8f7ff", fontFamily: "'Inter', sans-serif" }}>
      {/* ── TOP BAR ── */}
      <div style={{
        background: "linear-gradient(135deg, #4c1d95 0%, #7c3aed 60%, #a855f7 100%)",
        padding: "0 5%",
        boxShadow: "0 4px 24px rgba(76,29,149,0.3)",
      }}>
        <div style={{
          maxWidth: 1100, margin: "0 auto",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          height: 64,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Link href="/admin" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 34, height: 34, background: "rgba(255,255,255,0.2)",
                borderRadius: 9, display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: "1rem",
                border: "1.5px solid rgba(255,255,255,0.35)",
              }}>💸</div>
              <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: "1.15rem", color: "#fff" }}>
                Admin Payouts
              </span>
            </Link>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: "rgba(255,255,255,0.75)", fontSize: "0.82rem" }}>
              {userProfile.displayName}
            </span>
            <Link href="/admin" style={{
              background: "rgba(255,255,255,0.15)", color: "#fff",
              border: "1.5px solid rgba(255,255,255,0.35)",
              borderRadius: 99, padding: "6px 16px",
              fontSize: "0.8rem", fontWeight: 700, textDecoration: "none",
            }}>
              ← Admin Home
            </Link>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "36px 5% 80px" }}>
        
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "2rem", fontWeight: 900, color: "#1f2937", margin: "0 0 4px" }}>
              Payout Dashboard
            </h1>
            <p style={{ color: "#6b7280", fontSize: "0.88rem", margin: 0 }}>Review and process creator payout requests.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: "wrap" }}>
            {/* Live via onSnapshot — no manual refresh needed. The chip
                doubles as a status indicator. */}
            <span style={{
              padding: "6px 14px", borderRadius: 20, fontSize: "0.85rem", fontWeight: 600,
              border: "1.5px solid #d1fae5", background: "#ecfdf5", color: "#065f46",
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              🟢 Live
            </span>
            {(["all", "pending", "paid", "cancelled"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 20,
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  border: "1.5px solid",
                  borderColor: filter === f ? "#7c3aed" : "#e5e7eb",
                  background: filter === f ? "#f5f3ff" : "#fff",
                  color: filter === f ? "#7c3aed" : "#6b7280",
                  cursor: "pointer",
                  textTransform: 'capitalize'
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {dataLoading ? (
           <div className="skeleton" style={{ height: 400, borderRadius: 14, border: "2.5px solid #e5e7eb", background: '#eee', animation: 'pulse 1.5s infinite ease-in-out' }} />
        ) : (
          <div style={{
            background: "#fff", border: "2.5px solid #000", borderRadius: 14,
            boxShadow: "4px 4px 0 #000", overflow: "hidden"
          }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 800, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb", textAlign: "left" }}>
                    <th style={{ padding: "16px", fontSize: "0.8rem", fontWeight: 700, color: "#4b5563" }}>Date</th>
                    <th style={{ padding: "16px", fontSize: "0.8rem", fontWeight: 700, color: "#4b5563" }}>Creator</th>
                    <th style={{ padding: "16px", fontSize: "0.8rem", fontWeight: 700, color: "#4b5563" }}>Amount</th>
                    <th style={{ padding: "16px", fontSize: "0.8rem", fontWeight: 700, color: "#4b5563" }}>Bank Detail</th>
                    <th style={{ padding: "16px", fontSize: "0.8rem", fontWeight: 700, color: "#4b5563" }}>Status</th>
                    <th style={{ padding: "16px", fontSize: "0.8rem", fontWeight: 700, color: "#4b5563", textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>No payouts found.</td></tr>
                  ) : (
                    filtered.map(p => (
                      <tr key={p.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "16px", fontSize: "0.85rem", color: "#4b5563" }}>{timeFmt(p.createdAt)}</td>
                        <td style={{ padding: "16px", fontSize: "0.85rem" }}>
                          <span style={{ fontWeight: 600, color: "#1f2937", display: 'block' }}>{p.creatorEmail}</span>
                          <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>{p.creatorId}</span>
                        </td>
                        <td style={{ padding: "16px", fontSize: "0.95rem", fontWeight: 800, color: "#10b981" }}>{fmt$(p.amount)}</td>
                        <td style={{ padding: "16px", fontSize: "0.85rem", color: "#4b5563" }}>
                           {p.paymentMethod} {maskBank(p.bankDetails)}
                        </td>
                        <td style={{ padding: "16px" }}>
                          <span style={{
                            background: p.status === 'paid' ? '#dcfce7' : p.status === 'cancelled' ? '#fee2e2' : '#fef9c3',
                            color: p.status === 'paid' ? '#166534' : p.status === 'cancelled' ? '#991b1b' : '#a16207',
                            padding: '4px 10px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 700, textTransform: 'capitalize'
                          }}>
                            {p.status}
                          </span>
                        </td>
                        <td style={{ padding: "16px", textAlign: 'right' }}>
                          {p.status === 'pending' && (
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                              <button onClick={() => handleMarkPaid(p)} style={{ padding: "6px 12px", fontSize: "0.75rem", borderRadius: 6, border: '1.5px solid #10b981', color: '#10b981', background: 'none', cursor: 'pointer', fontWeight: 700 }}>Mark Paid</button>
                              <button onClick={() => handleCancel(p)} style={{ padding: "6px 12px", fontSize: "0.75rem", borderRadius: 6, border: '1.5px solid #ef4444', color: '#ef4444', background: 'none', cursor: 'pointer', fontWeight: 700 }}>Reject</button>
                            </div>
                          )}
                          {p.status === 'paid' && (
                             <div style={{ textAlign: 'right' }}>
                               {p.reference && <span style={{ fontSize: "0.75rem", color: "#6b7280", display: 'block' }}>Ref: {p.reference}</span>}
                               <button onClick={() => handleResendNotification(p)} style={{ fontSize: '0.65rem', color: '#7c3aed', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>
                                 Resend Email
                               </button>
                             </div>
                          )}
                          {p.status === 'cancelled' && (
                             <div style={{ textAlign: 'right' }}>
                               {p.adminNotes && <span style={{ fontSize: "0.75rem", color: "#ef4444", display: 'block', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.adminNotes}>Reason: {p.adminNotes}</span>}
                               <button onClick={() => handleResendNotification(p)} style={{ fontSize: '0.65rem', color: '#7c3aed', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>
                                 Resend Email
                               </button>
                             </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
