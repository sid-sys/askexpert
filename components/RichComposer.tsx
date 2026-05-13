"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export interface Attachment {
  id: string;
  type: "file";
  name: string;
  mimeType?: string;
  size?: number;
  file?: File; // Store actual file for upload
}

interface RichComposerProps {
  value: string;
  onChange: (val: string) => void;
  onAttachmentsChange?: (attachments: Attachment[]) => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
}

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

function extractUrls(text: string): string[] {
  return Array.from(new Set([...(text.matchAll(URL_RE) || [])].map((m) => m[0])));
}

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function RichComposer({
  value,
  onChange,
  onAttachmentsChange,
  placeholder = "What do you want to ask?",
  maxLength = 500,
  disabled = false,
}: RichComposerProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showGDriveTip, setShowGDriveTip] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileAcceptRef = useRef<string>("*/*");

  const detectedUrls = extractUrls(value);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 220) + "px";
  }, [value]);

  // Sync attachments up
  useEffect(() => {
    onAttachmentsChange?.(attachments);
  }, [attachments, onAttachmentsChange]);

  // Close attach menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── File helpers ──────────────────────────────────────────────────────────
  const addFiles = useCallback((files: File[]) => {
    const hasFile = files.length > 0;
    if (hasFile) setShowGDriveTip(true);
    const newAtts: Attachment[] = files.map((f) => ({
      id: Math.random().toString(36).slice(2),
      type: "file" as const,
      name: f.name,
      mimeType: f.type,
      size: f.size,
      file: f,
    }));
    setAttachments((prev) => [...prev, ...newAtts]);
  }, []);

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const next = prev.filter((a) => a.id !== id);
      if (!next.some((a) => a.type === "file")) setShowGDriveTip(false);
      return next;
    });
  }

  // ── Drag & Drop ───────────────────────────────────────────────────────────
  const onDragEnter = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) addFiles(files);
  };

  // ── File input ────────────────────────────────────────────────────────────
  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length) addFiles(files);
    e.target.value = "";
  }

  function openFileDialog(accept: string) {
    setShowAttachMenu(false);
    fileAcceptRef.current = accept;
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept;
      fileInputRef.current.click();
    }
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const borderColor = isDragging ? "#7c3aed" : "var(--border)";
  const bgColor     = isDragging ? "rgba(124,58,237,0.04)" : "var(--surface)";
  const overLimit   = value.length > maxLength * 0.9;

  return (
    <div
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        border: `1.5px solid ${borderColor}`,
        borderRadius: 16,
        background: bgColor,
        transition: "border-color 0.2s, background 0.2s",
        position: "relative",
        overflow: "visible",
      }}
    >
      {/* Drag-drop overlay */}
      {isDragging && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 20,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "rgba(124,58,237,0.07)",
          border: "2px dashed #7c3aed",
          borderRadius: 16,
          pointerEvents: "none",
          gap: 8,
        }}>
          <div style={{ fontSize: "2rem" }}>📎</div>
          <p style={{ margin: 0, color: "#7c3aed", fontWeight: 700, fontSize: "0.9rem" }}>
            Drop to attach
          </p>
        </div>
      )}

      {/* ── Textarea ── */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        style={{
          width: "100%",
          minHeight: 96,
          maxHeight: 220,
          border: "none",
          outline: "none",
          resize: "none",
          padding: "14px 16px 10px",
          fontSize: "0.95rem",
          lineHeight: 1.65,
          fontFamily: "inherit",
          background: "transparent",
          boxSizing: "border-box",
          overflowY: "auto",
          color: "var(--text-dark)",
        }}
      />

      {/* ── Detected clickable links ── */}
      {detectedUrls.length > 0 && (
        <div style={{ padding: "0 14px 10px", display: "flex", flexWrap: "wrap", gap: 6 }}>
          {detectedUrls.map((url, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                background: "rgba(124,58,237,0.1)", color: "var(--purple)",
                border: "1px solid rgba(124,58,237,0.25)",
                borderRadius: 99, padding: "2px 10px",
                fontSize: "0.73rem", fontWeight: 600,
                textDecoration: "none",
                maxWidth: 260, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              🔗 {url.replace(/^https?:\/\//, "").slice(0, 42)}
              {url.replace(/^https?:\/\//, "").length > 42 ? "…" : ""}
            </a>
          ))}
        </div>
      )}

      {/* ── Attachment chips ── */}
      {attachments.length > 0 && (
        <div style={{ padding: "0 14px 10px", display: "flex", flexWrap: "wrap", gap: 8 }}>
          {attachments.map((att) => (
            <div
              key={att.id}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "var(--bg-soft)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "5px 10px",
                fontSize: "0.78rem", fontWeight: 600, color: "var(--text-dark)",
              }}
            >
              <span>📎</span>
              <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {att.name}
              </span>
              {att.size && (
                <span style={{ color: "var(--muted)", fontSize: "0.68rem" }}>({fmtBytes(att.size)})</span>
              )}
              <button
                type="button"
                onClick={() => removeAttachment(att.id)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--muted)", fontSize: "1rem", padding: 0, lineHeight: 1,
                  marginLeft: 2,
                }}
                aria-label="Remove attachment"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── GDrive tip banner ── */}
      {showGDriveTip && (
        <div style={{
          margin: "0 14px 10px",
          background: "rgba(251,191,36,0.08)",
          border: "1px solid rgba(251,191,36,0.3)",
          borderRadius: 10,
          padding: "10px 12px",
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
        }}>
          <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>☁️</span>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 700, color: "var(--orange)" }}>
              Tip: For large files, use Google Drive
            </p>
            <p style={{ margin: "3px 0 0", fontSize: "0.73rem", color: "var(--muted)", lineHeight: 1.5 }}>
              Upload to{" "}
              <a href="https://drive.google.com" target="_blank" rel="noopener noreferrer"
                style={{ color: "var(--purple)", fontWeight: 700 }}>
                Google Drive
              </a>{" "}
              and paste the shareable link in your question for secure access.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowGDriveTip(false)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--muted)", fontSize: "1rem", padding: 0, flexShrink: 0,
            }}
          >×</button>
        </div>
      )}

      {/* ── Action bar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 12px",
        borderTop: "1px solid var(--border)",
        background: "var(--bg-soft)",
        borderRadius: "0 0 14px 14px",
      }}>
        {/* + Attach menu */}
        <div style={{ position: "relative" }} ref={menuRef}>
          <button
            type="button"
            id="rich-attach-btn"
            onClick={() => setShowAttachMenu((s) => !s)}
            title="Attach file"
            style={{
              width: 34, height: 34, borderRadius: "50%",
              border: `1.5px solid ${showAttachMenu ? "#7c3aed" : "var(--border)"}`,
              background: showAttachMenu ? "#7c3aed" : "var(--surface)",
              color: showAttachMenu ? "#fff" : "var(--muted)",
              fontSize: "1.25rem", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s",
              fontWeight: 400,
            }}
          >
            +
          </button>

          {showAttachMenu && (
            <div style={{
              position: "absolute",
              bottom: "calc(100% + 8px)",
              left: 0,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
              minWidth: 190,
              zIndex: 200,
              overflow: "hidden",
            }}>
              {[
                { icon: "📄", label: "Document",        sub: ".pdf .doc .xls .ppt …", accept: ".pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx,.csv" },
                { icon: "🖼️", label: "Photos & Videos", sub: "jpg, png, mp4 …",       accept: "image/*,video/*" },
                { icon: "🎵", label: "Audio file",       sub: "mp3, wav, m4a …",       accept: "audio/*" },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => openFileDialog(item.accept)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    width: "100%", padding: "11px 16px",
                    background: "none", border: "none",
                    cursor: "pointer", textAlign: "left",
                    transition: "background 0.1s",
                    color: "var(--text-dark)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-soft)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  <span style={{
                    width: 34, height: 34, borderRadius: 8,
                    background: "var(--bg-soft)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "1.1rem", flexShrink: 0,
                  }}>
                    {item.icon}
                  </span>
                  <div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-dark)" }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>{item.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Char count */}
        <span style={{
          marginLeft: "auto",
          fontSize: "0.78rem",
          color: overLimit ? "#f59e0b" : "var(--muted)",
          fontWeight: 600,
        }}>
          {value.length}/{maxLength}
        </span>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={handleFileInput}
      />
    </div>
  );
}
