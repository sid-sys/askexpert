"use client";

import { useState, useEffect } from "react";

export default function MobileDebug() {
  const [url, setUrl] = useState("/");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Use current origin for the iframe
    if (typeof window !== "undefined") {
      setUrl(window.location.origin + "/");
    }
  }, []);

  if (!mounted) return null;

  return (
    <div style={{ 
      display: "flex", 
      flexDirection: "column", 
      alignItems: "center", 
      justifyContent: "center", 
      minHeight: "100vh", 
      background: "#111", 
      color: "#fff",
      fontFamily: "monospace",
      padding: "20px"
    }}>
      <h1 style={{ marginBottom: "20px", color: "#7c3aed" }}>Mobile Debug (375px)</h1>
      
      <div style={{ 
        width: "375px", 
        height: "667px", 
        border: "8px solid #333", 
        borderRadius: "32px", 
        overflow: "hidden", 
        background: "#fff",
        boxShadow: "0 20px 50px rgba(0,0,0,0.5)"
      }}>
        <iframe 
          src={url} 
          style={{ width: "100%", height: "100%", border: "none" }}
          title="Mobile Preview"
        />
      </div>

      <div style={{ marginTop: "20px", display: "flex", gap: "10px" }}>
        <input 
          type="text" 
          value={url} 
          onChange={(e) => setUrl(e.target.value)} 
          style={{ 
            padding: "8px 12px", 
            borderRadius: "4px", 
            border: "none", 
            width: "300px",
            background: "#222",
            color: "#fff"
          }}
        />
        <button 
          onClick={() => setUrl(window.location.origin + "/")}
          style={{ 
            padding: "8px 16px", 
            background: "#7c3aed", 
            color: "#fff", 
            border: "none", 
            borderRadius: "4px", 
            cursor: "pointer" 
          }}
        >
          Reset
        </button>
      </div>
      
      <p style={{ marginTop: "10px", fontSize: "12px", opacity: 0.6 }}>
        Testing layout for iPhone size. No DevTools needed.
      </p>
    </div>
  );
}
