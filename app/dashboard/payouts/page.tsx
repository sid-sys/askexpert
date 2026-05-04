"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collection, getDocs, query, orderBy, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

interface Payout {
  id: string;
  creatorId: string;
  amount: number; // in cents
  createdAt: any;
  status: "pending" | "paid" | "cancelled";
  paymentMethod?: string;
  bankDetails?: string;
  reference?: string;
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

export default function PayoutHistoryPage() {
  const { user, userProfile, loading } = useAuth();
  const router = useRouter();

  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && (!user || !userProfile?.isCreator)) {
      router.replace("/dashboard");
    }
  }, [loading, user, userProfile, router]);

  useEffect(() => {
    if (!user || (!userProfile?.isCreator)) return;

    const fetchPayouts = async () => {
      setDataLoading(true);
      try {
        const q = query(
          collection(db, "pendingPayouts"),
          where("creatorId", "==", user.uid)
        );
        const pSnap = await getDocs(q);
        const data = pSnap.docs.map(d => ({ id: d.id, ...d.data() } as Payout));
        
        // Handle sorting on client since we can't easily composite order by with where without index
        data.sort((a,b) => {
           let tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime();
           let tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime();
           return tB - tA;
        });

        setPayouts(data);
      } catch (err) {
        console.error("Failed to fetch payouts:", err);
      } finally {
        setDataLoading(false);
      }
    };

    fetchPayouts();
  }, [user, userProfile]);


  if (loading || !user || !userProfile?.isCreator) return null;

  return (
    <div className="dash-page" style={{ minHeight: "100vh", background: "#f8f7ff", padding: "32px 5% 80px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 32 }}>
          <div>
            <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "2rem", fontWeight: 900, color: "#1f2937", margin: "0 0 4px" }}>
              Payout History
            </h1>
            <p style={{ color: "#6b7280", fontSize: "0.88rem", margin: 0 }}>Track your past and pending payments.</p>
          </div>
          <Link href="/dashboard" className="btn-secondary" style={{ padding: "8px 16px", fontSize: "0.85rem" }}>
            ← Back to Dashboard
          </Link>
        </div>

        {dataLoading ? (
           <div className="skeleton" style={{ height: 400, borderRadius: 14, border: "2.5px solid #e5e7eb" }} />
        ) : (
          <div style={{
            background: "#fff", border: "2.5px solid #000", borderRadius: 14,
            boxShadow: "4px 4px 0 #000", overflow: "hidden"
          }}>
            <div className="admin-table-wrapper">
              <table className="admin-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb", textAlign: "left" }}>
                    <th style={{ padding: "16px", fontSize: "0.8rem", fontWeight: 700, color: "#4b5563" }}>Date Requested</th>
                    <th style={{ padding: "16px", fontSize: "0.8rem", fontWeight: 700, color: "#4b5563" }}>Amount</th>
                    <th style={{ padding: "16px", fontSize: "0.8rem", fontWeight: 700, color: "#4b5563" }}>Method</th>
                    <th style={{ padding: "16px", fontSize: "0.8rem", fontWeight: 700, color: "#4b5563" }}>Status</th>
                    <th style={{ padding: "16px", fontSize: "0.8rem", fontWeight: 700, color: "#4b5563", textAlign: 'right' }}>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>No payout history found.</td></tr>
                  ) : (
                    payouts.map(p => (
                      <tr key={p.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "16px", fontSize: "0.85rem", color: "#4b5563" }}>{timeFmt(p.createdAt)}</td>
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
                        <td style={{ padding: "16px", textAlign: 'right', fontSize: "0.85rem", color: "#6b7280" }}>
                          {p.reference || "-"}
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
