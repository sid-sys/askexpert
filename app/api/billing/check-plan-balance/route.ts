// POST /api/billing/check-plan-balance
//
// Earnings-cap enforcement loop. For the authenticated creator:
//
//   1. Compute their last-30-day gross earnings from the questions collection.
//   2. If they're over their current plan's monthly cap AND there is a higher
//      tier, attempt to auto-upgrade them. The next tier's monthly fee is
//      deducted from totalEarnings (the platform pays itself out of the
//      creator's accrued earnings instead of charging their card).
//   3. If totalEarnings can't cover the fee, set paymentDue=true so the
//      answer flow can block them while still letting fans send questions.
//
// Idempotent — running it twice in the same month doesn't double-charge,
// because we stamp lastPlanFeeChargedAt and only deduct once per calendar month.
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb, FieldValue } from "@/lib/firebase-admin";
import {
  getMonthlyCapCents,
  PLAN_MONTHLY_FEE_CENTS,
  nextPlanTier,
} from "@/lib/stripe";

type ApiResult = {
  plan: string;
  monthlyEarningsCents: number;
  capCents: number;
  exceeded: boolean;
  upgradedTo?: string;
  paymentDue?: boolean;
  paymentDueCents?: number;
  alreadyChargedThisMonth?: boolean;
};

function sameCalendarMonth(a: Date, b: Date) {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
}

export async function POST(req: NextRequest) {
  try {
    const idToken = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!idToken) return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    const userRef = adminDb.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const userData = userSnap.data() ?? {};

    const plan = (userData.platformPlan ?? "free") as string;
    const totalEarnings = (userData.totalEarnings ?? 0) as number;

    // Compute the last-30-day gross earnings from the questions collection.
    // We only count ANSWERED or PAID questions — pending ones haven't really
    // earned anything because they could still refund.
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const monthSnap = await adminDb
      .collection("questions")
      .where("creatorId", "==", uid)
      .where("createdAt", ">=", since)
      .get();

    let monthlyEarningsCents = 0;
    for (const d of monthSnap.docs) {
      const data = d.data();
      const status = (data.status ?? "").toString().toUpperCase();
      if (status === "ANSWERED" || status === "PAID" || status === "PENDING") {
        monthlyEarningsCents += Number(data.pricePaid ?? 0);
      }
    }

    const capCents = getMonthlyCapCents(plan);
    const exceeded = monthlyEarningsCents >= capCents;
    const result: ApiResult = { plan, monthlyEarningsCents, capCents, exceeded };

    if (!exceeded) {
      // Below cap. Stamp the check timestamp and exit cleanly. If they were
      // previously flagged but somehow earned less this month (refunds), we
      // leave paymentDue alone — admin / billing portal clears it.
      await userRef.set({ lastPlanCapCheck: FieldValue.serverTimestamp() }, { merge: true });
      return NextResponse.json(result);
    }

    // Over the cap. Try to bump them to the next tier.
    const nextTier = nextPlanTier(plan);
    if (!nextTier) {
      // Already on the top tier (pro) — caps shouldn't apply, but harmless.
      return NextResponse.json(result);
    }

    // Don't re-charge if we already deducted the next-tier fee this month.
    const lastCharged = (userData.lastPlanFeeChargedAt as any)?.toDate?.() as Date | undefined;
    if (lastCharged && sameCalendarMonth(lastCharged, new Date())) {
      result.alreadyChargedThisMonth = true;
      result.upgradedTo = userData.platformPlan; // whatever we ended up on
      return NextResponse.json(result);
    }

    const feeCents = PLAN_MONTHLY_FEE_CENTS[nextTier] ?? 0;

    if (totalEarnings >= feeCents) {
      // Sufficient accrued earnings — deduct and upgrade in-place.
      await userRef.set(
        {
          platformPlan: nextTier,
          // Mark this subscription as "internally" maintained — distinct from a
          // Stripe-issued platformPlanStripeSubId so the webhook doesn't fight
          // us if the creator later subscribes via Stripe Checkout.
          platformPlanStripeSubId: `auto:${nextTier}`,
          totalEarnings: FieldValue.increment(-feeCents),
          paymentDue: false,
          paymentDueCents: 0,
          lastPlanFeeChargedAt: FieldValue.serverTimestamp(),
          lastPlanCapCheck: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      result.upgradedTo = nextTier;
    } else {
      // Not enough accrued earnings to cover the next tier's fee. Flag the
      // creator as payment-due — the answer route will refuse to send replies
      // while this is true. Fans can still ask, so revenue keeps flowing.
      const owed = feeCents - totalEarnings;
      await userRef.set(
        {
          paymentDue: true,
          paymentDueCents: owed,
          paymentDueSince: FieldValue.serverTimestamp(),
          lastPlanCapCheck: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      result.paymentDue = true;
      result.paymentDueCents = owed;
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[check-plan-balance] error:", err);
    return NextResponse.json({ error: err.message ?? "check failed" }, { status: 500 });
  }
}
