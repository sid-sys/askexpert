"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/types";

type Subscription = {
  id: string;
  creatorId: string;
  creatorUsername?: string;
  creatorName?: string;
  status: string;
};

type Question = {
  id: string;
  content: string;
  status: string;
  response?: string;
  createdAt: Date;
  creatorId: string;
};

export default function FanDashboardPage() {
  const { user, userProfile } = useAuth();
  const router = useRouter();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user === null) {
      router.push("/auth?redirect=/fan-dashboard");
    }
  }, [user, router]);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch active subscriptions
        const subSnap = await getDocs(
          query(
            collection(db, COLLECTIONS.SUBSCRIPTIONS),
            where("followerId", "==", user.uid),
            where("status", "==", "active")
          )
        );

        const rawSubs = subSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Subscription));

        // Enrich each subscription with creator username/name
        const enriched = await Promise.all(
          rawSubs.map(async (sub) => {
            try {
              const creatorSnap = await getDocs(
                query(collection(db, COLLECTIONS.USERS), where("uid", "==", sub.creatorId))
              );
              if (!creatorSnap.empty) {
                const cd = creatorSnap.docs[0].data();
                return { ...sub, creatorUsername: cd.username, creatorName: cd.displayName };
              }
            } catch {
              // silently ignore lookup failures
            }
            return sub;
          })
        );
        setSubscriptions(enriched);

        // Fetch questions asked by this fan
        const qSnap = await getDocs(
          query(collection(db, COLLECTIONS.QUESTIONS), where("followerUid", "==", user.uid))
        );
        const qs = qSnap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              content: data.content || "",
              status: data.status || "PENDING",
              response: data.response || "",
              createdAt: data.createdAt?.toDate?.() ?? new Date(),
              creatorId: data.creatorId || "",
            } as Question;
          })
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        setQuestions(qs);
      } catch (err) {
        console.error("Fan dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  if (!user) return null;

  const displayName = (userProfile as any)?.displayName || user.email || "Fan";

  return (
    <div style={{ minHeight: "100vh", background: "#fafafa", paddingBottom: 80 }}>
      {/* Nav */}
      <nav style={{
        background: "#fff", borderBottom: "1px solid #e5e7eb",
        padding: "0 24px", height: 60,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 100,
        boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
      }}>
        <a href="/" style={{
          fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "1.2rem",
          background: "linear-gradient(135deg, #7c3aed, #a855f7)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          textDecoration: "none",
        }}>
          AskExpert
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "#6b7280", fontSize: "0.85rem" }}>
            Hi, {displayName} 👋
          </span>
          <a href="/auth" style={{
            background: "linear-gradient(135deg, #7c3aed, #a855f7)",
            color: "#fff", borderRadius: 99, padding: "6px 14px",
            fontSize: "0.78rem", fontWeight: 700, textDecoration: "none",
          }}>
            Sign Out
          </a>
        </div>
      </nav>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px" }}>
        <h1 style={{
          fontFamily: "'Syne', sans-serif", fontWeight: 800,
          fontSize: "2rem", color: "#111827", marginBottom: 6,
        }}>
          Fan Dashboard
        </h1>
        <p style={{ color: "#6b7280", marginBottom: 40, fontSize: "0.95rem" }}>
          Your subscriptions and question history.
        </p>

        {loading ? (
          <div style={{ textAlign: "center", color: "#9ca3af", padding: 60, fontSize: "1.1rem" }}>
            Loading…
          </div>
        ) : (
          <>
            {/* ── Subscriptions ── */}
            <section style={{ marginBottom: 48 }}>
              <h2 style={{
                fontSize: "0.75rem", fontWeight: 800, color: "#374151",
                textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16,
              }}>
                🌟 My Subscriptions
              </h2>

              {subscriptions.length === 0 ? (
                <div style={{
                  background: "#fff", border: "1px solid #e5e7eb",
                  borderRadius: 16, padding: "40px 32px", textAlign: "center",
                }}>
                  <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>🔍</div>
                  <p style={{ color: "#6b7280", marginBottom: 20, fontSize: "0.95rem" }}>
                    No active subscriptions yet.
                  </p>
                  <a href="/" style={{
                    display: "inline-block",
                    background: "linear-gradient(135deg, #7c3aed, #a855f7)",
                    color: "#fff", padding: "12px 24px", borderRadius: 12,
                    fontWeight: 700, textDecoration: "none", fontSize: "0.9rem",
                  }}>
                    Discover Creators →
                  </a>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {subscriptions.map((sub) => (
                    <div key={sub.id} style={{
                      background: "#fff",
                      border: "1.5px solid #ede9fe",
                      borderRadius: 14, padding: "18px 22px",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      boxShadow: "0 2px 12px rgba(124,58,237,0.06)",
                    }}>
                      <div>
                        <p style={{ fontWeight: 700, color: "#1f2937", margin: "0 0 6px", fontSize: "1rem" }}>
                          {sub.creatorName || sub.creatorUsername || sub.creatorId}
                          {sub.creatorUsername && (
                            <span style={{ color: "#9ca3af", fontWeight: 500, fontSize: "0.85rem", marginLeft: 6 }}>
                              @{sub.creatorUsername}
                            </span>
                          )}
                        </p>
                        <span style={{
                          background: "#dcfce7", color: "#166534",
                          borderRadius: 99, padding: "2px 10px",
                          fontSize: "0.72rem", fontWeight: 700,
                        }}>
                          ✓ Active
                        </span>
                      </div>
                      {sub.creatorUsername && (
                        <a href={`/${sub.creatorUsername}`} style={{
                          color: "#7c3aed", fontWeight: 700, fontSize: "0.85rem",
                          textDecoration: "none", padding: "8px 16px",
                          border: "1.5px solid #ede9fe", borderRadius: 10,
                          transition: "all 0.15s",
                        }}>
                          Ask a Question →
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── Questions ── */}
            <section>
              <h2 style={{
                fontSize: "0.75rem", fontWeight: 800, color: "#374151",
                textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16,
              }}>
                ❓ My Questions ({questions.length})
              </h2>

              {questions.length === 0 ? (
                <div style={{
                  background: "#fff", border: "1px solid #e5e7eb",
                  borderRadius: 16, padding: "40px 32px", textAlign: "center",
                }}>
                  <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>💬</div>
                  <p style={{ color: "#6b7280", fontSize: "0.95rem" }}>
                    You haven&apos;t asked any questions yet.
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {questions.map((q) => (
                    <div key={q.id} style={{
                      background: "#fff", border: "1px solid #e5e7eb",
                      borderRadius: 14, padding: "18px 22px",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                        <p style={{ fontWeight: 600, color: "#1f2937", margin: 0, flex: 1, lineHeight: 1.55 }}>
                          {q.content}
                        </p>
                        <span style={{
                          background: q.status === "ANSWERED" ? "#dcfce7" : q.status === "PENDING" ? "#fef3c7" : "#f3f4f6",
                          color: q.status === "ANSWERED" ? "#166534" : q.status === "PENDING" ? "#92400e" : "#6b7280",
                          borderRadius: 99, padding: "3px 11px",
                          fontSize: "0.7rem", fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0,
                        }}>
                          {q.status}
                        </span>
                      </div>

                      {q.response && (
                        <div style={{
                          background: "#f0fdf4", border: "1px solid #bbf7d0",
                          borderRadius: 10, padding: "12px 16px",
                          fontSize: "0.88rem", color: "#166534", lineHeight: 1.65,
                        }}>
                          <strong>Answer: </strong>{q.response}
                        </div>
                      )}

                      <p style={{ color: "#9ca3af", fontSize: "0.74rem", margin: "10px 0 0" }}>
                        {q.createdAt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
