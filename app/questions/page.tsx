"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  FirestoreQuestion, COLLECTIONS, QuestionStatus,
  QuestionCategory, CATEGORY_LABELS,
} from "@/lib/types";
import QuestionCard from "@/components/QuestionCard";

const STATUS_TABS: { label: string; status: QuestionStatus | "ALL" }[] = [
  { label: "All", status: "ALL" },
  { label: "⏳ Pending", status: "PENDING" },
  { label: "✅ Answered", status: "ANSWERED" },
  { label: "↩ Refunded", status: "REFUNDED" },
];

type SortOption = "newest" | "oldest" | "price_high" | "price_low";
type DateRange = "all" | "7d" | "30d";

function getDateCutoff(range: DateRange): Date | null {
  if (range === "7d") return new Date(Date.now() - 7 * 86400000);
  if (range === "30d") return new Date(Date.now() - 30 * 86400000);
  return null;
}

const S = {
  container: { maxWidth: 980, margin: "0 auto", padding: "40px 24px" } as React.CSSProperties,
  pill: (active: boolean): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "0.45rem 1.1rem",
    fontFamily: "'Outfit', sans-serif",
    fontSize: "0.84rem",
    fontWeight: 600,
    borderRadius: "99px",
    border: "none",
    cursor: "pointer",
    transition: "all 0.18s",
    background: active ? "#7c3aed" : "#f3f4f6",
    color: active ? "#fff" : "#6b7280",
    whiteSpace: "nowrap" as const,
  }),
};

export default function QuestionsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [questions, setQuestions] = useState<FirestoreQuestion[]>([]);
  const [fetching, setFetching] = useState(true);

  // Filters
  const [tab, setTab] = useState<QuestionStatus | "ALL">("ALL");
  const [category, setCategory] = useState<QuestionCategory | "all">("all");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [sort, setSort] = useState<SortOption>("newest");

  useEffect(() => {
    if (!loading && !user) router.push("/auth");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    setFetching(true);
    const q = query(
      collection(db, COLLECTIONS.QUESTIONS),
      where("creatorId", "==", user.uid),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const qs = snap.docs.map((d) => {
        const data = d.data();
        return {
          ...data, id: d.id,
          createdAt: data.createdAt?.toDate?.() || new Date(),
          answeredAt: data.answeredAt?.toDate?.() || null,
          expiresAt: data.expiresAt?.toDate?.() || new Date(),
        } as FirestoreQuestion;
      });
      setQuestions(qs);
      setFetching(false);
    }, () => {
      setQuestions([]);
      setFetching(false);
    });
    return () => unsub();
  }, [user]);

  const filtered = useMemo(() => {
    const cutoff = getDateCutoff(dateRange);
    return questions
      .filter((q) => tab === "ALL" || q.status === tab)
      .filter((q) => category === "all" || q.category === category)
      .filter((q) => !cutoff || q.createdAt >= cutoff)
      .sort((a, b) => {
        if (sort === "newest") return b.createdAt.getTime() - a.createdAt.getTime();
        if (sort === "oldest") return a.createdAt.getTime() - b.createdAt.getTime();
        if (sort === "price_high") return b.pricePaid - a.pricePaid;
        if (sort === "price_low") return a.pricePaid - b.pricePaid;
        return 0;
      });
  }, [questions, tab, category, dateRange, sort]);

  const pendingCount = questions.filter((q) => q.status === "PENDING").length;

  if (loading || (fetching && questions.length === 0)) {
    return (
      <div style={{ background: "#f7f7f8", minHeight: "100vh" }}>
        <div style={S.container}>
          <div style={{ height: 36, width: 220, background: "#ededee", borderRadius: 8, marginBottom: 20 }} />
          {[1,2,3].map(i => <div key={i} style={{ height: 120, background: "#ededee", borderRadius: 16, marginBottom: 14 }} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="dash-page" style={{ background: "#f7f7f8", minHeight: "100vh" }}>
      <div style={S.container}>
        {/* HEADER */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: "clamp(1.5rem,3vw,2rem)", fontWeight: 800, color: "#111", margin: 0, marginBottom: 4 }}>
            Questions
          </h1>
          <p style={{ fontFamily: "'Outfit', sans-serif", color: "#888", fontSize: "0.9rem", margin: 0 }}>
            All incoming questions from your audience.
          </p>
        </div>

        {/* FILTER BAR */}
        <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 16, padding: "16px 20px", marginBottom: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {STATUS_TABS.map((t) => (
              <button key={t.status} onClick={() => setTab(t.status)} style={S.pill(tab === t.status)}>
                {t.label}
                {t.status === "PENDING" && pendingCount > 0 && (
                  <span style={{ background: tab === "PENDING" ? "rgba(255,255,255,0.25)" : "#ede9fe", color: tab === "PENDING" ? "#fff" : "#7c3aed", borderRadius: 99, padding: "1px 7px", fontSize: "0.72rem", fontWeight: 800 }}>
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as QuestionCategory | "all")}
              style={{
                border: "1.5px solid #e5e7eb", borderRadius: 99, padding: "0.45rem 1rem",
                fontFamily: "'Inter', sans-serif", fontSize: "0.85rem", fontWeight: 600,
                color: "#374151", background: "#fff", cursor: "pointer", outline: "none",
                appearance: "auto",
              }}
            >
              <option value="all">📁 All Categories</option>
              {(Object.keys(CATEGORY_LABELS) as QuestionCategory[]).map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>

            <div style={{ display: "flex", gap: 6 }}>
              {([
                { label: "All time", val: "all" },
                { label: "Last 7d", val: "7d" },
                { label: "Last 30d", val: "30d" },
              ] as { label: string; val: DateRange }[]).map(({ label, val }) => (
                <button key={val} onClick={() => setDateRange(val)} style={S.pill(dateRange === val)}>
                  {label}
                </button>
              ))}
            </div>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              style={{
                border: "1.5px solid #e5e7eb", borderRadius: 99, padding: "0.45rem 1rem",
                fontFamily: "'Inter', sans-serif", fontSize: "0.85rem", fontWeight: 600,
                color: "#374151", background: "#fff", cursor: "pointer", outline: "none",
                appearance: "auto", marginLeft: "auto",
              }}
            >
              <option value="newest">↓ Newest first</option>
              <option value="oldest">↑ Oldest first</option>
              <option value="price_high">💰 Highest price</option>
              <option value="price_low">💸 Lowest price</option>
            </select>

            <span style={{ fontFamily: "'Inter', sans-serif", color: "#9ca3af", fontSize: "0.82rem", whiteSpace: "nowrap" }}>
              {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* QUESTION LIST */}
        {filtered.length === 0 ? (
          <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 16, textAlign: "center", padding: "48px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <p style={{ fontSize: "2rem", marginBottom: 10 }}>📭</p>
            <p style={{ fontFamily: "'Outfit', sans-serif", color: "#999", margin: 0, fontSize: "0.92rem" }}>No questions match these filters.</p>
            <button
              onClick={() => { setTab("ALL"); setCategory("all"); setDateRange("all"); setSort("newest"); }}
              style={{ marginTop: 14, background: "#7c3aed", border: "none", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "0.85rem", padding: "8px 20px", borderRadius: 99, fontFamily: "'Outfit', sans-serif" }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.map((q) => (
              <QuestionCard
                key={q.id}
                question={q}
                onAnswered={() =>
                  setQuestions((prev) =>
                    prev.map((p) => p.id === q.id ? { ...p, status: "ANSWERED", isNew: false } : p)
                  )
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
