// Firestore collection names + TypeScript types

export type QuestionStatus = "PENDING" | "ANSWERED" | "REFUNDED";
export type QuestionCategory = "business" | "tech" | "finance" | "health" | "career" | "relationships" | "other";
export type ReplyFormat = "text" | "audio" | "video" | "meet";
export type AnswerType = "text" | "image" | "file" | "link" | "audio";
export type PricingMode = "per-question" | "monthly";
export type PlatformPlan = "free" | "creator" | "pro";
export type PayoutMethod = "stripe_connect" | "manual_bank";
export type PayoutStatus = "pending" | "paid" | "cancelled";

export interface BankDetails {
  accountHolderName: string;
  accountNumber: string;     // masked on read
  bankName: string;
  country: string;           // ISO 3166-1 alpha-2, e.g. "IN", "GB"
  ifscCode?: string;         // India
  swiftCode?: string;        // International
  paypalEmail?: string;
  wiseEmail?: string;
}

export interface SocialLink {
  label: string; // e.g. "Twitter", "My Blog", "GitHub"
  url: string;   // full URL
}

export interface FirestoreUser {
  uid: string;
  email: string;
  username: string;
  displayName: string;
  bio: string;
  tagline?: string;
  photoURL: string;
  isCreator: boolean;
  isAdmin?: boolean;

  // ── Stripe Connect (auto payout) ────────────────────────────────────────
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;

  // ── Platform plan (creator's AskExpert subscription) ────────────────────
  platformPlan?: PlatformPlan;           // 'free' | 'creator' | 'pro'
  platformPlanStripeSubId?: string;       // Stripe subscription ID for this
  stripeCustomerId?: string;              // Stripe customer for billing portal
  // If the user clicked "Cancel subscription" in the Stripe Billing Portal,
  // their access stays active until the end of the current billing cycle.
  // We mirror that state here so the /upgrade UI can label the current-plan
  // button as "Cancels on <date>" instead of the usual "Manage Billing →".
  planCancelAtPeriodEnd?: boolean;
  planCurrentPeriodEnd?: Date | null;

  // ── Payout method ────────────────────────────────────────────────────────
  payoutMethod?: PayoutMethod;            // 'stripe_connect' | 'manual_bank'
  bankDetails?: BankDetails;             // Only set if payoutMethod = manual_bank
  pendingPayoutBalance?: number;          // cents owed (manual only)

  // ── Pricing ──────────────────────────────────────────────────────────────
  perQuestionPrice: number;              // in cents
  monthlyPrice: number;                  // in cents
  currency?: string;                     // ISO 4217 lowercase e.g. 'gbp','usd','inr'
  pricingMode?: PricingMode;             // 'per-question' | 'monthly'

  // ── Answer preferences ───────────────────────────────────────────────────
  allowedAnswerTypes?: AnswerType[];
  defaultAnswerType?: AnswerType;
  responseTimeHours?: number;            // default 72

  // ── Earnings ─────────────────────────────────────────────────────────────
  totalEarnings?: number;                // in cents, lifetime gross
  // Cumulative split of totalEarnings. Each payment increments these at the
  // fee tier active right then, so the breakdown stays accurate even when
  // the creator changes plan tiers later. Fall back to a current-tier
  // estimate when these are missing (older docs).
  totalCreatorNet?: number;              // cents creator earned after fee
  totalPlatformFee?: number;             // cents kept by the platform

  // ── Auto-upgrade billing (paid out of accrued earnings) ──────────────────
  // When the creator exceeds their plan's monthly cap and we auto-upgrade
  // them, the new tier's monthly fee is deducted from totalEarnings. If
  // there isn't enough to cover it, paymentDue is set and the creator is
  // blocked from answering questions until the balance is settled (fans
  // can still ask in the meantime).
  paymentDue?: boolean;
  paymentDueCents?: number;
  paymentDueSince?: Date;
  lastPlanFeeChargedAt?: Date;
  lastPlanCapCheck?: Date;

  // ── Profile ──────────────────────────────────────────────────────────────
  socialLinks?: SocialLink[];
  categories?: string[];
  responseFormats?: string[];
  allowReviews?: boolean;
  createdAt: Date;
  subscriberPerks?: string[];
  pppEnabled?: boolean;

  // ── Online Status & Vacation ─────────────────────────────────────────────
  isOnline?: boolean;
  lastSeen?: Date;
  vacationMode?: boolean;
  vacationUntil?: Date;
  vacationMessage?: string;
}

export interface FirestoreQuestion {
  id?: string;
  content: string;
  response: string | null;
  status: QuestionStatus;
  pricePaid: number; // in cents
  followerEmail: string;
  followerName: string;
  creatorId: string;
  stripePaymentIntentId: string;
  stripeChargeId: string | null;
  createdAt: Date;
  answeredAt: Date | null;
  expiresAt: Date; // createdAt + 72hrs
  // New fields
  isNew?: boolean;
  category?: QuestionCategory;
  requestedReplyFormat?: ReplyFormat;
  answerType?: AnswerType;
  answerUrl?: string; // for image/file/audio/link answers
  attachmentUrls?: string[]; // Multiple attachments support for Asker
  answerAttachmentUrls?: string[]; // Multiple attachments support for Creator

  isPublicAnswer?: boolean; // creator can make answered Q visible on public profile
}

export interface FirestoreReview {
  id?: string;
  creatorId: string;
  reviewerEmail: string;
  reviewerName?: string;
  rating: number;      // 1-5 stars
  comment: string;
  createdAt: Date;
}

export interface FirestoreSubscription {
  id?: string;
  creatorId: string;
  followerId: string;
  followerEmail: string;
  stripeSubscriptionId: string;
  status: "active" | "canceled" | "past_due";
  createdAt: Date;
}

// ── Manual payout record (created for every payment to a non-Connect creator) ──
export interface FirestorePayout {
  id?: string;
  creatorId: string;
  creatorName: string;
  creatorEmail?: string;
  amount: number;             // creator's cut in cents (after platform fee)
  platformFeeAmount: number;  // platform fee in cents
  totalPaid: number;          // gross amount paid by asker in cents
  currency: string;
  questionId?: string;
  subscriptionId?: string;
  paymentType: "per_question" | "monthly_subscription";
  status: PayoutStatus;
  bankDetails?: BankDetails;
  stripeSessionId: string;
  createdAt: Date;
  paidAt?: Date;
  notes?: string;             // admin notes e.g. "Paid via Wise 2024-01-15"
}

// Collection paths
export const COLLECTIONS = {
  USERS: "users",
  QUESTIONS: "questions",
  SUBSCRIPTIONS: "subscriptions",
  REVIEWS: "reviews",
  PENDING_PAYOUTS: "pendingPayouts",
  PROCESSED_EVENTS: "processedEvents",
  VACATION_SUBSCRIPTIONS: "vacation_subscriptions",
} as const;

// Display labels
export const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  business: "💼 Business",
  tech: "💻 Tech",
  finance: "💰 Finance",
  health: "🏃 Health",
  career: "🚀 Career",
  relationships: "❤️ Relationships",
  other: "✨ Other",
};

export const REPLY_FORMAT_LABELS: Record<ReplyFormat, string> = {
  text: "📝 Text",
  audio: "🎙 Audio",
  video: "🎥 Video",
  meet: "📹 Google Meet",
};

export const ANSWER_TYPE_LABELS: Record<AnswerType, string> = {
  text: "📝 Text",
  image: "🖼 Image",
  file: "📎 File",
  link: "🔗 Link",
  audio: "🎙 Audio",
};

export interface VacationSubscription {
  id?: string;
  creatorId: string;
  userEmail: string;
  createdAt: any;
  status: "pending" | "notified" | "converted";
  notifiedAt?: any;
  convertedAt?: any;
  convertedQuestionId?: string;
}

