import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service – AskExpert",
  description:
    "Read AskExpert's Terms of Service — the rules that govern use of the platform for both experts and question askers.",
};

const sections = [
  {
    title: "1. Acceptance of Terms",
    content: `By accessing or using AskExpert ("the Platform"), you agree to be bound by these Terms of Service. If you do not agree with any part of these terms, you may not use the platform. These terms apply to all users, including registered experts and question askers.`,
  },
  {
    title: "2. Eligibility",
    content: `You must be at least 16 years old to use AskExpert. By creating an account, you represent and warrant that:

• You are at least 16 years of age.
• You have the legal capacity to enter into a binding agreement.
• You will comply with these Terms of Service.
• All information you provide is accurate and truthful.`,
  },
  {
    title: "3. Expert Accounts",
    content: `Experts are users who receive payments for answering questions. As an expert:

• You are responsible for the accuracy and quality of answers you provide.
• You must answer questions within a reasonable timeframe or issue a refund.
• You may not impersonate professionals (e.g., claim to be a licensed lawyer or doctor) when you are not.
• AskExpert takes a platform fee of 15% from each transaction.
• Payouts are processed via Stripe Connect and subject to Stripe's terms.`,
  },
  {
    title: "4. Question Askers",
    content: `As someone asking a question and paying for an answer:

• Payments are non-refundable unless the expert fails to respond within 7 days or provides a materially incorrect answer.
• Refund requests must be submitted within 14 days of purchase.
• You may not share, resell, or republish answers without the expert's consent.
• Questions must not violate our Acceptable Use Policy (see Section 6).`,
  },
  {
    title: "5. Payments and Fees",
    content: `All payments are processed by Stripe, Inc. By using payment features, you agree to Stripe's Terms of Service.

• AskExpert charges a **15% platform fee** on all transactions.
• Experts receive **85%** of the question price, minus Stripe processing fees (~2.9% + 30¢).
• Payouts are transferred to your connected Stripe account.
• Prices are set in GBP by default but may vary by region.
• All prices include applicable taxes where required by law.`,
  },
  {
    title: "6. Acceptable Use Policy",
    content: `You agree not to use AskExpert to:

• Submit or transmit unlawful, harmful, defamatory, or obscene content.
• Impersonate any person or entity or misrepresent your qualifications.
• Engage in spam, phishing, or other deceptive practices.
• Attempt to gain unauthorised access to the platform or other users' accounts.
• Use automated bots, scrapers, or similar tools without prior written consent.
• Ask questions designed to solicit illegal advice or facilitate illegal activity.

Violation of this policy may result in immediate account suspension.`,
  },
  {
    title: "7. Intellectual Property",
    content: `• **Your Content:** You retain ownership of any content you submit (questions, answers, profile information).
• **Licence to AskExpert:** By submitting content, you grant AskExpert a non-exclusive, royalty-free licence to display and deliver your content through the platform.
• **Platform IP:** The AskExpert brand, logo, design, and software are the intellectual property of AskExpert and may not be copied or used without permission.`,
  },
  {
    title: "8. Disclaimers",
    content: `AskExpert is a platform that connects question askers with experts. We do not:

• Verify the professional qualifications of any expert.
• Guarantee the accuracy, completeness, or usefulness of any answer.
• Provide legal, medical, financial, or professional advice ourselves.

**Answers provided by experts are for informational purposes only and do not constitute professional advice.** Always consult a qualified professional for important decisions.`,
  },
  {
    title: "9. Limitation of Liability",
    content: `To the maximum extent permitted by law, AskExpert shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the platform. Our total liability shall not exceed the amount you paid to AskExpert in the 12 months preceding the claim.`,
  },
  {
    title: "10. Termination",
    content: `We may suspend or terminate your account at any time for violation of these Terms. You may delete your account at any time via Settings. Upon termination, your right to use the platform ceases. Pending payouts will be processed within 30 days of termination.`,
  },
  {
    title: "11. Governing Law",
    content: `These Terms are governed by and construed in accordance with the laws of England and Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.`,
  },
  {
    title: "12. Changes to Terms",
    content: `We may modify these Terms at any time. We will provide at least 14 days' notice via email or an in-app banner before changes take effect. Continued use of the platform after changes constitutes acceptance of the new Terms.`,
  },
  {
    title: "13. Contact",
    content: `For questions about these Terms:\n\n📧 legal@askexpert.ink`,
  },
];

export default function TermsPage() {
  const lastUpdated = "19 April 2026";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-white)",
        fontFamily: "'Outfit', sans-serif",
      }}
    >
      {/* Header */}
      <section
        style={{
          background: "linear-gradient(135deg, #1f2937 0%, #374151 100%)",
          padding: "64px 24px 48px",
          color: "#fff",
        }}
      >
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ opacity: 0.6, fontSize: "0.85rem", marginBottom: 8 }}>
            Legal
          </div>
          <h1
            style={{
              fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
              fontWeight: 900,
              margin: "0 0 12px",
            }}
          >
            Terms of Service
          </h1>
          <p style={{ opacity: 0.7, fontSize: "0.9rem", margin: 0 }}>
            Last updated: {lastUpdated}
          </p>
        </div>
      </section>

      {/* Content */}
      <section style={{ padding: "56px 24px 80px", maxWidth: 800, margin: "0 auto" }}>
        <div
          style={{
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: 12,
            padding: "16px 20px",
            marginBottom: 40,
            color: "#92400e",
            fontSize: "0.9rem",
            lineHeight: 1.6,
          }}
        >
          ⚠️ Please read these terms carefully before using AskExpert. By
          using the platform, you agree to be bound by these terms.
        </div>

        {sections.map((sec) => (
          <div key={sec.title} style={{ marginBottom: 40 }}>
            <h2
              style={{
                fontSize: "1.15rem",
                fontWeight: 800,
                color: "var(--text-dark)",
                marginBottom: 14,
                paddingBottom: 10,
                borderBottom: "2px solid #f3f4f6",
              }}
            >
              {sec.title}
            </h2>
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "0.93rem",
                lineHeight: 1.8,
                whiteSpace: "pre-line",
              }}
            >
              {sec.content.split("**").map((part, i) =>
                i % 2 === 1 ? (
                  <strong key={i} style={{ color: "var(--text-dark)" }}>
                    {part}
                  </strong>
                ) : (
                  part
                )
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
