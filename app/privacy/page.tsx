import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy – AskExpert",
  description:
    "Read AskExpert's privacy policy to understand how we collect, use, and protect your personal data.",
};

const sections = [
  {
    title: "1. Information We Collect",
    content: `We collect information you provide directly to us:

• **Account Information:** Name, email address, and profile details when you register.
• **Payment Information:** Payments are processed by PCI-DSS compliant third-party payment providers. We store only the last 4 digits of cards and transaction records. We never see or store your full card details.
• **Questions & Answers:** Content you submit on the platform, including questions asked and answers provided.
• **Usage Data:** Pages visited, features used, and time spent on the platform to improve our service.
• **Device Information:** Browser type, operating system, and IP address for security purposes.`,
  },
  {
    title: "2. How We Use Your Information",
    content: `We use the information we collect to:

• Operate, maintain, and improve the AskExpert platform.
• Process payments and send transaction confirmations.
• Send email notifications for new questions, answers, and account activity.
• Detect, investigate, and prevent fraudulent transactions and abuse.
• Respond to your comments and questions and provide customer service.
• Monitor and analyse trends and usage to improve user experience.`,
  },
  {
    title: "3. Data Sharing",
    content: `We do not sell, trade, or rent your personal data to third parties.`,
  },
  {
    title: "4. Data Retention",
    content: `We retain your personal data for as long as your account is active or as needed to provide services. If you delete your account, we will delete your personal data within 30 days, except where retention is required by law (e.g., financial records for 7 years).`,
  },
  {
    title: "5. Cookies",
    content: `We use essential cookies to keep you logged in and maintain session security. We do not use advertising or tracking cookies. You can control cookie settings through your browser preferences, though this may affect functionality.`,
  },
  {
    title: "6. Your Rights (GDPR / UK GDPR)",
    content: `If you are located in the UK or EU, you have the right to:

• **Access:** Request a copy of your personal data.
• **Rectification:** Correct inaccurate data.
• **Erasure:** Request deletion of your data ("right to be forgotten").
• **Portability:** Receive your data in a portable format.
• **Objection:** Object to certain types of processing.

To exercise any of these rights, contact us at contact@askexpert.ink.`,
  },
  {
    title: "7. Security",
    content: `We implement industry-standard security measures including HTTPS encryption, secure authentication, PCI-compliant payment processing, and regular security reviews. However, no method of transmission over the internet is 100% secure.`,
  },
  {
    title: "8. Children's Privacy",
    content: `AskExpert is not directed to individuals under the age of 16. We do not knowingly collect personal information from children. If we become aware that a child has provided us with personal information, we will delete it immediately.`,
  },
  {
    title: "9. Changes to This Policy",
    content: `We may update this Privacy Policy from time to time. We will notify you of any significant changes by email or by posting a prominent notice on the platform at least 14 days before the change takes effect.`,
  },
  {
    title: "10. Contact",
    content: `For any privacy-related questions or to exercise your rights, contact us at:\n\n📧 contact@askexpert.ink`,
  },
];

export default function PrivacyPage() {
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
          background: "linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)",
          padding: "64px 24px 48px",
          color: "#fff",
        }}
      >
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ opacity: 0.75, fontSize: "0.85rem", marginBottom: 8 }}>
            Legal
          </div>
          <h1
            style={{
              fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
              fontWeight: 900,
              margin: "0 0 12px",
            }}
          >
            Privacy Policy
          </h1>
          <p style={{ opacity: 0.8, fontSize: "0.9rem", margin: 0 }}>
            Last updated: {lastUpdated}
          </p>
        </div>
      </section>

      {/* Content */}
      <section style={{ padding: "56px 24px 80px", maxWidth: 800, margin: "0 auto" }}>
        <div
          style={{
            background: "#f5f3ff",
            border: "1px solid #e0d7ff",
            borderRadius: 12,
            padding: "16px 20px",
            marginBottom: 40,
            color: "#5b21b6",
            fontSize: "0.9rem",
            lineHeight: 1.6,
          }}
        >
          Your privacy matters to us. AskExpert is committed to protecting your
          personal data and being transparent about how we use it.
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
                borderBottom: "2px solid #f0eaff",
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
