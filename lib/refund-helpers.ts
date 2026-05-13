// Helpers shared by the refund cron + auto-refund routes so the refund email
// always reflects the creator's actual response-time setting — not a
// hardcoded 72-hour default.
//
// Resolution order for the response-time window we surface to the asker:
//   1. The value captured on the question at checkout time (q.responseTimeHours).
//      That's the window we actually enforced for this question.
//   2. The derived window from (expiresAt - createdAt), used as a fallback for
//      legacy questions written before responseTimeHours was being persisted.
//   3. The creator's current responseTimeHours setting (single Firestore read).
//   4. 72 hours as a last-ditch default.

import { adminDb } from "@/lib/firebase-admin";

type Timestamped = { toDate?: () => Date } | Date | null | undefined;

function toMs(t: Timestamped): number | null {
  if (!t) return null;
  if (t instanceof Date) return t.getTime();
  if (typeof (t as any).toDate === "function") {
    try { return (t as any).toDate().getTime(); } catch { return null; }
  }
  return null;
}

export async function resolveResponseTimeHours(
  q: Record<string, any>,
  creatorId: string | undefined | null,
): Promise<number> {
  // 1. Explicit field on the question — the window we charged against.
  if (typeof q.responseTimeHours === "number" && q.responseTimeHours > 0) {
    return q.responseTimeHours;
  }

  // 2. Derive from the recorded expiry window.
  const createdMs = toMs(q.createdAt);
  const expiresMs = toMs(q.expiresAt);
  if (createdMs && expiresMs && expiresMs > createdMs) {
    const hours = Math.round((expiresMs - createdMs) / 3_600_000);
    if (hours > 0 && hours < 24 * 365) return hours;
  }

  // 3. Fall back to the creator's current setting.
  if (creatorId) {
    try {
      const snap = await adminDb.collection("users").doc(creatorId).get();
      const v = snap.data()?.responseTimeHours;
      if (typeof v === "number" && v > 0) return v;
    } catch { /* ignore — fall through to default */ }
  }

  // 4. Platform default.
  return 72;
}
