import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Us – AskExpert",
  description:
    "Learn about AskExpert — the platform that lets creators and experts monetize their knowledge through simple paid Q&A links.",
};

const stats = [
  { value: "10K+", label: "Questions answered" },
  { value: "500+", label: "Active experts" },
  { value: "98%", label: "Satisfaction rate" },
  { value: "$0", label: "Setup cost" },
];

const team = [
  {
    name: "Sidha",
    role: "Founder & CEO",
    bio: "Serial builder passionate about creator economy and making expert knowledge accessible to everyone.",
    avatar: "S",
    color: "#7c3aed",
  },
];

export default function AboutPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-white)",
        fontFamily: "'Outfit', sans-serif",
      }}
    >
      {/* Hero */}
      <section
        style={{
          background: "linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)",
          padding: "80px 24px 64px",
          textAlign: "center",
          color: "#fff",
        }}
      >
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(255,255,255,0.15)",
              borderRadius: 999,
              padding: "6px 16px",
              fontSize: "0.8rem",
              fontWeight: 600,
              marginBottom: 24,
              backdropFilter: "blur(8px)",
            }}
          >
            🚀 Our Story
          </div>
          <h1
            style={{
              fontSize: "clamp(2rem, 5vw, 3rem)",
              fontWeight: 900,
              margin: "0 0 20px",
              lineHeight: 1.2,
            }}
          >
            Your Knowledge Has Value.
            <br />
            We&apos;re Here to Prove It.
          </h1>
          <p
            style={{
              fontSize: "1.1rem",
              opacity: 0.85,
              lineHeight: 1.7,
              maxWidth: 560,
              margin: "0 auto",
            }}
          >
            AskExpert was built for creators, consultants, and experts who are
            tired of giving free advice. We make it simple to get paid for every
            answer.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section
        style={{
          background: "#f9fafb",
          padding: "48px 24px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            maxWidth: 900,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 32,
            textAlign: "center",
          }}
        >
          {stats.map((s) => (
            <div key={s.label}>
              <div
                style={{
                  fontSize: "2.5rem",
                  fontWeight: 900,
                  color: "#7c3aed",
                  lineHeight: 1,
                }}
              >
                {s.value}
              </div>
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "0.9rem",
                  marginTop: 6,
                }}
              >
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Mission */}
      <section style={{ padding: "72px 24px", maxWidth: 800, margin: "0 auto" }}>
        <h2
          style={{
            fontSize: "1.75rem",
            fontWeight: 800,
            color: "var(--text-dark)",
            marginBottom: 20,
          }}
        >
          Our Mission
        </h2>
        <p
          style={{
            color: "var(--text-muted)",
            lineHeight: 1.8,
            fontSize: "1rem",
            marginBottom: 20,
          }}
        >
          We believe every expert deserves to be compensated fairly for their
          time and knowledge. Whether you&apos;re a developer, designer, lawyer,
          doctor, or YouTuber — your answers have real value.
        </p>
        <p
          style={{
            color: "var(--text-muted)",
            lineHeight: 1.8,
            fontSize: "1rem",
            marginBottom: 20,
          }}
        >
          AskExpert gives you a beautiful, shareable profile link. Fans and
          followers pay a one-time fee to ask their question. You answer when you
          have time. You get paid directly.
        </p>
        <p
          style={{
            color: "var(--text-muted)",
            lineHeight: 1.8,
            fontSize: "1rem",
          }}
        >
          No subscriptions to manage. No DMs to filter through. Just meaningful
          questions, answered on your schedule, with money in your pocket.
        </p>
      </section>

      {/* Team */}
      <section
        style={{
          padding: "0 24px 80px",
          maxWidth: 800,
          margin: "0 auto",
        }}
      >
        <h2
          style={{
            fontSize: "1.75rem",
            fontWeight: 800,
            color: "var(--text-dark)",
            marginBottom: 32,
          }}
        >
          Meet the Team
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 24,
          }}
        >
          {team.map((member) => (
            <div
              key={member.name}
              style={{
                background: "#fff",
                border: "1px solid var(--border)",
                borderRadius: 16,
                padding: 28,
                boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: `linear-gradient(135deg, ${member.color}, ${member.color}99)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontWeight: 900,
                  fontSize: "1.4rem",
                  marginBottom: 16,
                }}
              >
                {member.avatar}
              </div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "1.05rem",
                  color: "var(--text-dark)",
                }}
              >
                {member.name}
              </div>
              <div
                style={{
                  color: member.color,
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  marginBottom: 10,
                }}
              >
                {member.role}
              </div>
              <p
                style={{
                  color: "var(--text-muted)",
                  fontSize: "0.88rem",
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                {member.bio}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
