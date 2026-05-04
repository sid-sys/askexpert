"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("cookie-consent");
    if (!consent) {
      // Delay slightly for better UX
      const timer = setTimeout(() => setShowBanner(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleConsent = (choice: "accepted" | "declined") => {
    localStorage.setItem("cookie-consent", choice);
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="cookie-banner-container animate__animated animate__fadeInUp">
      <div className="cookie-banner-card">
        <div className="cookie-banner-content">
          <div className="cookie-icon">🍪</div>
          <div className="cookie-text">
            <h3>Cookie Notice</h3>
            <p>
              We use cookies to enhance your experience and analyze our traffic. 
              Read our <Link href="/privacy">Privacy Policy</Link> for more details.
            </p>
          </div>
        </div>
        <div className="cookie-banner-actions">
          <button 
            onClick={() => handleConsent("declined")}
            className="btn-cookie-secondary"
          >
            Decline
          </button>
          <button 
            onClick={() => handleConsent("accepted")}
            className="btn-cookie-primary"
          >
            Accept All
          </button>
        </div>
      </div>

      <style jsx>{`
        .cookie-banner-container {
          position: fixed;
          bottom: 24px;
          left: 24px;
          right: 24px;
          z-index: 9999;
          display: flex;
          justify-content: center;
          pointer-events: none;
        }

        .cookie-banner-card {
          background: var(--bg-white);
          border: 1px solid var(--border);
          box-shadow: var(--shadow-lg);
          border-radius: var(--radius-lg);
          padding: 20px 24px;
          max-width: 600px;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          pointer-events: auto;
        }

        .cookie-banner-content {
          display: flex;
          align-items: flex-start;
          gap: 16px;
        }

        .cookie-icon {
          font-size: 24px;
          margin-top: 2px;
        }

        .cookie-text h3 {
          font-size: 1rem;
          font-weight: 700;
          margin: 0 0 4px 0;
          color: var(--text-dark);
        }

        .cookie-text p {
          font-size: 0.85rem;
          color: var(--text-muted);
          margin: 0;
          line-height: 1.4;
        }

        .cookie-text p :global(a) {
          color: var(--primary);
          text-decoration: underline;
        }

        .cookie-banner-actions {
          display: flex;
          gap: 12px;
          flex-shrink: 0;
        }

        .btn-cookie-primary {
          background: var(--primary);
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: var(--radius-pill);
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-cookie-primary:hover {
          background: var(--primary-dark);
          transform: translateY(-1px);
        }

        .btn-cookie-secondary {
          background: transparent;
          color: var(--text-muted);
          border: 1px solid var(--border);
          padding: 10px 20px;
          border-radius: var(--radius-pill);
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-cookie-secondary:hover {
          background: var(--bg-soft);
          color: var(--text-dark);
        }

        @media (max-width: 900px) {
          .cookie-banner-container {
            bottom: 16px;
            left: 16px;
            right: 16px;
          }
          .cookie-banner-card {
            flex-direction: column;
            gap: 16px;
            padding: 20px;
            text-align: center;
          }
          .cookie-banner-content {
            flex-direction: column;
            align-items: center;
            gap: 12px;
          }
          .cookie-banner-actions {
            width: 100%;
          }
          .cookie-banner-actions button {
            flex: 1;
          }
        }
      `}</style>
    </div>
  );
}
