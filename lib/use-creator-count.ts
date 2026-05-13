"use client";

// Live count of active creators, rounded down to the nearest 100 with a
// "+" suffix and a floor of 100. Used wherever we surface social-proof
// copy ("100+ experts listed", "join 100+ experts", footer tally, …).
//
// Implementation notes:
//   • Uses Firestore's COUNT aggregation (`getCountFromServer`) — a single
//     billed read regardless of how many users we have.
//   • Memoised at the module level so multiple components mounted on the
//     same page (NavBar / Footer / hero pill / CTA) share one fetch.
//   • Falls back to the static "100+" floor on any failure so marketing
//     copy never shows a blank or NaN.

import { useEffect, useState } from "react";
import { collection, getCountFromServer, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/types";

function formatLabel(count: number): string {
  const floor = Math.max(100, Math.floor(count / 100) * 100);
  return `${floor.toLocaleString()}+`;
}

let cachedLabel: string | null = null;
let inflight: Promise<string> | null = null;

async function fetchLabel(): Promise<string> {
  if (cachedLabel !== null) return cachedLabel;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const snap = await getCountFromServer(
        query(collection(db, COLLECTIONS.USERS), where("isCreator", "==", true)),
      );
      const label = formatLabel(snap.data().count);
      cachedLabel = label;
      return label;
    } catch {
      return "100+";
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useCreatorCountLabel(): string {
  // Synchronous initial state lets the first paint already show "100+"
  // (or the cached value from a prior mount in this session).
  const [label, setLabel] = useState<string>(cachedLabel ?? "100+");
  useEffect(() => {
    let cancelled = false;
    fetchLabel().then((l) => { if (!cancelled) setLabel(l); });
    return () => { cancelled = true; };
  }, []);
  return label;
}
