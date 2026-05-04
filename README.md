# 💀 AskExpert — Setup Guide

> Cartoon-Horror SaaS for monetizing expertise via paid Q&A

## Stack
- **Framework:** Next.js 15 (App Router) + TypeScript
- **Styling:** Tailwind CSS + Custom Cartoon-Horror Design System
- **Auth + DB:** Firebase (Auth + Firestore)
- **Payments:** Stripe Connect Express (10% platform fee)
- **Email:** Resend
- **Cron:** cron-job.org

---

## Step 1: Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create new project: `askexpert`
3. Enable **Authentication** → Sign-in Methods → Enable **Google** and **Email/Password**
4. Create **Firestore Database** (production mode)
5. Deploy security rules: `npx firebase deploy --only firestore:rules`

### Get Client Config
Firebase Console → Project Settings → Your Apps → Web App → Copy config → paste into `.env.local`

### Get Admin SDK Credentials
Firebase Console → Project Settings → **Service Accounts** → **Generate new private key**

```env
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxx@project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```
> ⚠️ Keep quotes around FIREBASE_PRIVATE_KEY. Literal `\n` — not real newlines.

---

## Step 2: Stripe Setup

1. Create [Stripe account](https://stripe.com) → enable **Stripe Connect**
2. Copy Secret + Publishable keys to `.env.local`

### Local webhook testing
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
# Copy the printed webhook secret → STRIPE_WEBHOOK_SECRET
```

### Production webhook
Stripe Dashboard → Webhooks → Add:
- URL: `https://yourdomain.com/api/stripe/webhook`
- Events: `checkout.session.completed`

---

## Step 3: Resend Setup

1. [Resend.com](https://resend.com) → add + verify your domain
2. Copy API key → `RESEND_API_KEY`
3. Update sender in `lib/resend.ts`: `from: "AskExpert <noreply@yourdomain.com>"`

---

## Step 4: cron-job.org

1. [cron-job.org](https://cron-job.org) → New Cronjob
   - URL: `https://yourdomain.com/api/cron/refund-expired`
   - Method: `POST`
   - Header: `Authorization: Bearer YOUR_CRON_SECRET`
   - Schedule: every 60 min

Generate secret: `openssl rand -hex 32`

---

## Step 5: Run Locally

```bash
npm install
npm run dev
# Open http://localhost:3000
```

---

## Step 6: Deploy

**Firebase App Hosting (SSR support):**
```bash
npm i -g firebase-tools
firebase login
firebase init apphosting
firebase deploy
```

**Or Vercel (easiest):**
```bash
npx vercel
```

---

## Full .env.local

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
RESEND_API_KEY=
CRON_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Creator Flow
1. Sign up → Settings → Enable Creator Mode → Link Stripe
2. Share `yourapp.com/your-username`
3. Answer questions within 72hrs → email delivered to follower

## Follower Flow
1. Visit creator page → type question + email
2. Pay via Stripe Checkout (one-time or monthly)
3. Receive answer by email (or auto-refund after 72hrs)
