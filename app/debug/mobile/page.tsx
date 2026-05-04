"use client";
import { useState } from "react";

export default function MobileDebugPage() {
  const [inputValue, setInputValue] = useState("/");
  const [url, setUrl] = useState("/");

  const handleNavigate = () => {
    // Ensure relative paths start with /
    let path = inputValue;
    if (!path.startsWith("/") && !path.startsWith("http")) {
      path = "/" + path;
    }
    setUrl(path);
  };

  return (
    <div className="debug-container">
      <div className="debug-header">
        <h1>Mobile UI Audit Tool</h1>
        <div className="url-bar" style={{ display: "flex", gap: 10 }}>
          <input 
            type="text" 
            value={inputValue} 
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleNavigate()}
            placeholder="Enter path (e.g. /dashboard)"
            style={{ flex: 1 }}
          />
          <button 
            onClick={handleNavigate}
            style={{ 
              padding: "0 20px", 
              background: "#7c3aed", 
              color: "#fff", 
              border: "none", 
              borderRadius: 8, 
              fontWeight: 700,
              cursor: "pointer"
            }}
          >
            Go
          </button>
        </div>
        <p className="debug-hint">Viewing at 375px width (iPhone SE standard)</p>
      </div>

      <div className="iframe-wrapper">
        <iframe 
          key={url}
          src={url} 
          title="Mobile Viewport"
          className="mobile-iframe"
        />
      </div>

      <style jsx>{`
        .debug-container {
          min-height: 100vh;
          background: #f3f4f6;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 2rem;
          font-family: 'Outfit', sans-serif;
        }
        .debug-header {
          text-align: center;
          margin-bottom: 2rem;
          width: 100%;
          max-width: 600px;
        }
        h1 {
          color: #1f2937;
          margin-bottom: 1rem;
        }
        .url-bar {
          margin-bottom: 0.5rem;
        }
        input {
          width: 100%;
          padding: 0.75rem 1rem;
          border-radius: 8px;
          border: 1px solid #d1d5db;
          font-size: 1rem;
        }
        .debug-hint {
          color: #6b7280;
          font-size: 0.875rem;
        }
        .iframe-wrapper {
          background: #000;
          padding: 12px;
          border-radius: 40px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          border: 4px solid #374151;
        }
        .mobile-iframe {
          width: 375px;
          height: 667px;
          border: none;
          background: #fff;
          border-radius: 28px;
        }
      `}</style>
    </div>
  );
}
