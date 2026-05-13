"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { FirestoreQuestion, REPLY_FORMAT_LABELS, COLLECTIONS } from "@/lib/types";
import Swal from "sweetalert2";

interface QuestionCardProps {
  question: FirestoreQuestion;
  onAnswered?: () => void;
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  PENDING:  { bg: "#fef9c3", color: "#a16207", label: "⏳ Pending" },
  ANSWERED: { bg: "#dcfce7", color: "#166534", label: "✅ Answered" },
  REFUNDED: { bg: "#fee2e2", color: "#991b1b", label: "↩ Refunded" },
};

// Attachment menu items — three categories only
const ATTACH_MENU = [
  { key: "document", icon: "📄", label: "Document", accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip" },
  { key: "photo",    icon: "🖼️", label: "Photos & Videos", accept: "image/*,video/*" },
  { key: "audio",    icon: "🎧", label: "Audio", accept: "audio/*" },
];

// URL regex for auto-link detection
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

// Character limit for the response
const CHAR_LIMIT = 5000;

// Masks an email so the creator can recognise repeat askers without seeing the
// full address. e.g. "admin@gmail.com" -> "adm***@gmail.com"
function maskEmail(email: string | undefined | null): string {
  if (!email) return "Anonymous";
  const at = email.indexOf("@");
  if (at <= 0) return "Anonymous";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const visible = local.slice(0, Math.min(3, Math.max(1, local.length - 1)));
  return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}${domain}`;
}

export default function QuestionCard({ question, onAnswered }: QuestionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [responseText, setResponseText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isPublic, setIsPublic] = useState(!!question.isPublicAnswer);
  const [togglingPublic, setTogglingPublic] = useState(false);
  const [optimisticStatus, setOptimisticStatus] = useState(question.status);
  const [optimisticResponse, setOptimisticResponse] = useState(question.response);

  // Attachment state
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  // Drag-and-drop state
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const recordingInterval = useRef<NodeJS.Timeout | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Google Drive tip banner
  const [showDriveTip, setShowDriveTip] = useState(true);

  const statusStyle = STATUS_STYLES[optimisticStatus] ?? STATUS_STYLES.PENDING;
  const askerLabel = question.followerName?.trim() || maskEmail(question.followerEmail);
  const initials = (question.followerName?.trim() || question.followerEmail || "?")[0]?.toUpperCase();
  const timeAgo = getTimeAgo(question.createdAt);
  const hasContent = responseText.trim().length > 0 || attachedFiles.length > 0 || voiceBlob !== null;
  const charPercent = (responseText.length / CHAR_LIMIT) * 100;

  // ── Auto-link detection ──
  const detectedLinks = useMemo(() => {
    const matches = responseText.match(URL_REGEX);
    return matches ? [...new Set(matches)] : [];
  }, [responseText]);

  // ── Close attachment menu on outside click ──
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    }
    if (showAttachMenu) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showAttachMenu]);

  // ── Create object URL for voice blob (for <audio> preview) ──
  useEffect(() => {
    if (voiceBlob) {
      const url = URL.createObjectURL(voiceBlob);
      setVoiceUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setVoiceUrl(null);
    }
  }, [voiceBlob]);

  // ── Auto-resize textarea ──
  const autoResize = useCallback(() => {
    const t = textareaRef.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = Math.min(t.scrollHeight, 220) + "px";
    // Enable scroll if beyond max
    t.style.overflowY = t.scrollHeight > 220 ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    autoResize();
  }, [responseText, autoResize]);

  // ── Drag-and-drop handlers ──
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setAttachedFiles(prev => [...prev, ...files]);
    }
  }, []);

  // ── File handling ──
  function handleAttachChoice(accept: string) {
    setShowAttachMenu(false);
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept;
      fileInputRef.current.click();
    }
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setAttachedFiles(prev => [...prev, ...files]);
    }
    e.target.value = "";
  }

  function removeFile(idx: number) {
    setAttachedFiles(prev => prev.filter((_, i) => i !== idx));
  }

  // ── Voice recording ──
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setVoiceBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      mediaRecorder.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      recordingInterval.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch {
      setError("Microphone access denied. Please allow mic access.");
    }
  }

  function stopRecording() {
    mediaRecorder.current?.stop();
    setIsRecording(false);
    if (recordingInterval.current) clearInterval(recordingInterval.current);
  }

  function cancelVoice() {
    setVoiceBlob(null);
    setVoiceUrl(null);
    setRecordingTime(0);
  }

  // ── Upload files to Firebase Storage ──
  async function uploadAttachments(): Promise<string[]> {
    const urls: string[] = [];
    const total = attachedFiles.length + (voiceBlob ? 1 : 0);
    let done = 0;

    for (const file of attachedFiles) {
      setUploadProgress(`Uploading ${done + 1}/${total}...`);
      const storageRef = ref(storage, `answers/${question.id}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      urls.push(url);
      done++;
    }

    if (voiceBlob) {
      setUploadProgress(`Uploading voice note...`);
      const storageRef = ref(storage, `answers/${question.id}/${Date.now()}_voice.webm`);
      await uploadBytes(storageRef, voiceBlob);
      const url = await getDownloadURL(storageRef);
      urls.push(url);
    }

    return urls;
  }

  // ── Submit answer (with SweetAlert2 confirmation) ──
  async function handleSubmit() {
    if (!hasContent) return;

    // SweetAlert2 confirmation dialog
    const result = await Swal.fire({
      title: "Send this answer?",
      html: `<p style="color:#6b7280;font-size:0.92rem;line-height:1.6">
        Your answer will be sent to <strong>${askerLabel}</strong> immediately via email. This action cannot be undone.
      </p>`,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#7c3aed",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Yes, send it ➤",
      cancelButtonText: "Go back",
      reverseButtons: true,
      customClass: { popup: "swal-rounded" },
    });

    if (!result.isConfirmed) return;

    setSubmitting(true);
    setUploading(true);
    setError("");

    const savedStatus = optimisticStatus;
    const savedResponse = optimisticResponse;
    setOptimisticStatus("ANSWERED");
    setOptimisticResponse(responseText.trim() || "(attachment)");
    setShowForm(false);

    try {
      // Upload files first
      const uploadedUrls = await uploadAttachments();
      setUploading(false);

      const res = await fetch("/api/questions/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: question.id,
          response: responseText.trim() || "(see attachments)",
          creatorId: question.creatorId,
          answerType: voiceBlob ? "audio" : attachedFiles.length > 0 ? "file" : "text",
          answerUrl: uploadedUrls[0] || undefined,
          answerAttachmentUrls: uploadedUrls.length > 0 ? uploadedUrls : undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      // Clear everything
      setResponseText("");
      setAttachedFiles([]);
      setVoiceBlob(null);
      setVoiceUrl(null);
      setUploadProgress("");
      onAnswered?.();

      Swal.fire({
        title: "Sent!",
        text: "Your answer has been delivered.",
        icon: "success",
        timer: 2000,
        showConfirmButton: false,
        customClass: { popup: "swal-rounded" },
      });
    } catch {
      setOptimisticStatus(savedStatus);
      setOptimisticResponse(savedResponse);
      setShowForm(true);
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  }

  // Format seconds → mm:ss
  function fmtTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  // File icon helper
  function fileIcon(f: File) {
    if (f.type.startsWith("image")) return "🖼️";
    if (f.type.startsWith("video")) return "🎬";
    if (f.type.startsWith("audio")) return "🎵";
    return "📄";
  }

  return (
    <div style={{
      background: "#fff", borderRadius: 20,
      border: `1px solid ${question.isNew ? "#7c3aed" : "#e5e7eb"}`,
      boxShadow: question.isNew ? "0 0 0 2px rgba(124,58,237,0.15)" : "0 1px 4px rgba(0,0,0,0.06)",
      padding: "24px", transition: "box-shadow 0.2s", position: "relative", overflow: "hidden",
    }}>
      {/* NEW badge stripe */}
      {question.isNew && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg, #7c3aed, #a78bfa)" }} />
      )}

      {/* Top row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
        <div style={{
          width: 42, height: 42, borderRadius: "50%",
          background: "linear-gradient(135deg, #7c3aed, #a78bfa)",
          color: "#fff", fontWeight: 800, fontSize: "1rem",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>{initials}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "#374151" }}>{askerLabel}</span>
            {question.isNew && (
              <span style={{ background: "#7c3aed", color: "#fff", borderRadius: 99, padding: "1px 10px", fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.05em" }}>NEW</span>
            )}
            {question.category && (
              <span style={{ background: "#f5f3ff", color: "#7c3aed", borderRadius: 99, padding: "1px 10px", fontSize: "0.72rem", fontWeight: 600 }}>{question.category}</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ background: statusStyle.bg, color: statusStyle.color, borderRadius: 99, padding: "2px 12px", fontSize: "0.75rem", fontWeight: 700 }}>{statusStyle.label}</span>
            {question.requestedReplyFormat && question.requestedReplyFormat !== "text" && (
              <span style={{ background: "#fef3c7", color: "#92400e", borderRadius: 99, padding: "2px 12px", fontSize: "0.72rem", fontWeight: 600 }}>
                {REPLY_FORMAT_LABELS[question.requestedReplyFormat]} requested
              </span>
            )}
            <span style={{ color: "#9ca3af", fontSize: "0.78rem" }}>{timeAgo}</span>
            <LiveTimer expiresAt={question.expiresAt} status={optimisticStatus} />
            <span style={{ color: "#7c3aed", fontWeight: 800, fontSize: "0.85rem", marginLeft: "auto" }}>
              ${((question.pricePaid || 0) / 100).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Question content */}
      <div style={{ background: "#f9fafb", borderRadius: 12, padding: "14px 16px", marginBottom: 16, cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
        <p style={{
          margin: 0, color: "#374151", lineHeight: 1.65, fontSize: "0.93rem",
          overflow: expanded ? "visible" : "hidden",
          display: expanded ? "block" : "-webkit-box",
          WebkitLineClamp: expanded ? undefined : 2,
          WebkitBoxOrient: "vertical" as const,
        }}>{question.content}</p>
        {question.content?.length > 100 && (
          <span style={{ color: "#7c3aed", fontSize: "0.78rem", fontWeight: 600, marginTop: 6, display: "block" }}>
            {expanded ? "Show less ▲" : "Read more ▼"}
          </span>
        )}
      </div>

      {/* ── Incoming attachments from the asker (voice notes / files) ── */}
      {Array.isArray(question.attachmentUrls) && question.attachmentUrls.length > 0 && (
        <div style={{
          background: "#f0f9ff", border: "1px solid #bae6fd",
          borderRadius: 12, padding: "12px 16px", marginBottom: 16,
        }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase", color: "#0369a1", letterSpacing: "0.06em", marginBottom: 10 }}>
            🎙️ Asker&apos;s Voice / Attachments
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {question.attachmentUrls.map((url, i) => renderAttachment(url, i))}
          </div>
        </div>
      )}

      {/* Answered view */}
      {optimisticStatus === "ANSWERED" && optimisticResponse && (
        <div style={{ background: "#f5f3ff", borderRadius: 12, padding: "14px 16px", borderLeft: "3px solid #7c3aed", marginBottom: 16 }}>
          <div style={{ fontSize: "0.73rem", fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", marginBottom: 8, letterSpacing: "0.05em" }}>
            Your Answer
          </div>
          <p style={{ margin: 0, color: "#374151", lineHeight: 1.65, fontSize: "0.92rem", marginBottom: 12 }}>{optimisticResponse}</p>
          
          {Array.isArray(question.answerAttachmentUrls) && question.answerAttachmentUrls.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12, paddingTop: 12, borderTop: "1px solid #ddd6fe" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase", color: "#7c3aed", letterSpacing: "0.06em" }}>
                Attachments
              </div>
              {question.answerAttachmentUrls.map((url, i) => renderAttachment(url, i))}
            </div>
          )}
          
          {!Array.isArray(question.answerAttachmentUrls) && question.answerUrl && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #ddd6fe" }}>
              {renderAttachment(question.answerUrl, 0)}
            </div>
          )}
        </div>
      )}

      {/* CTA row — PENDING only, no edit */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {optimisticStatus === "PENDING" && !showForm && (
          <button onClick={() => setShowForm(true)} style={{
            background: "#7c3aed", color: "#fff",
            border: "none", borderRadius: 99, padding: "10px 22px", fontWeight: 700,
            fontSize: "0.85rem", cursor: "pointer", transition: "all 0.2s",
          }}>
            ✏️ Answer
          </button>
        )}
        {optimisticStatus === "ANSWERED" && question.id && (
          <button
            type="button"
            disabled={togglingPublic}
            title={isPublic
              ? "This answer is visible on your public profile to anyone who visits it. Click to make it private again."
              : "Publish this Q&A on your public profile so anyone visiting can read it. The asker stays anonymous. You can revert anytime."}
            aria-pressed={isPublic}
            onClick={async () => {
              setTogglingPublic(true);
              try {
                const next = !isPublic;
                await updateDoc(doc(db, COLLECTIONS.QUESTIONS, question.id!), {
                  isPublicAnswer: next,
                  updatedAt: serverTimestamp()
                });
                setIsPublic(next);
              } catch { /* ignore */ } finally { setTogglingPublic(false); }
            }}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: isPublic ? "#dcfce7" : "#f9fafb", color: isPublic ? "#166534" : "#6b7280",
              border: `1.5px solid ${isPublic ? "#bbf7d0" : "#e5e7eb"}`, borderRadius: 99, padding: "8px 18px",
              fontWeight: 700, fontSize: "0.82rem", cursor: togglingPublic ? "not-allowed" : "pointer", transition: "all 0.2s",
            }}
          >
            {togglingPublic
              ? "…"
              : isPublic
              ? <><span style={{ fontSize: "0.9rem" }}>🌐</span> Public on Profile · Click to make private</>
              : <><span style={{ fontSize: "0.9rem" }}>🔒</span> Make Public</>}
          </button>
        )}
      </div>

      {/* Hidden file input */}
      <input type="file" ref={fileInputRef} style={{ display: "none" }} multiple onChange={handleFileSelected} />

      {/* ═══════════════ RICH COMPOSER ═══════════════ */}
      {showForm && (
        <div
          ref={composerRef}
          style={{ marginTop: 12, position: "relative" }}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* Small "Reply" header row with a close × on the right. Keeps the
              close button clear of the input bar's mic/send slot below so
              there's no overlap on narrow viewports. */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 8, paddingRight: 2,
          }}>
            <span style={{
              fontFamily: "'Outfit',sans-serif", fontSize: "0.72rem",
              fontWeight: 700, color: "#7c3aed", textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}>Your reply</span>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              aria-label="Close composer"
              title="Discard and close"
              className="qc-composer-close"
              style={{
                width: 26, height: 26, borderRadius: "50%",
                border: "1px solid #e5e7eb", background: "#fff",
                color: "#9ca3af", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.85rem", lineHeight: 1, fontWeight: 600,
                padding: 0, flexShrink: 0,
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#f3f4f6"; (e.currentTarget as HTMLElement).style.color = "#374151"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#fff"; (e.currentTarget as HTMLElement).style.color = "#9ca3af"; }}
            >✕</button>
          </div>

          {/* ── Drag overlay ── */}
          {dragging && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 60,
              background: "rgba(124,58,237,0.08)",
              border: "2.5px dashed #7c3aed", borderRadius: 18,
              display: "flex", alignItems: "center", justifyContent: "center",
              pointerEvents: "none",
            }}>
              <div style={{
                background: "#fff", borderRadius: 14, padding: "18px 32px",
                boxShadow: "0 8px 32px rgba(124,58,237,0.18)",
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{ fontSize: "1.5rem" }}>📎</span>
                <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#7c3aed" }}>
                  Drop files here to attach
                </span>
              </div>
            </div>
          )}

          {/* ── Google Drive tip banner ── */}
          {attachedFiles.length > 0 && showDriveTip && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 12,
              padding: "10px 14px", marginBottom: 12,
            }}>
              <span style={{ fontSize: "1.1rem" }}>💡</span>
              <span style={{ flex: 1, fontSize: "0.82rem", color: "#1e40af", fontWeight: 500, lineHeight: 1.4 }}>
                For large files, consider sharing a <strong>Google Drive</strong> link instead — just paste the URL in your message.
              </span>
              <button type="button" onClick={() => setShowDriveTip(false)} style={{
                background: "none", border: "none", color: "#3b82f6", cursor: "pointer",
                fontWeight: 800, fontSize: "0.85rem", padding: 0, lineHeight: 1, flexShrink: 0,
              }}>✕</button>
            </div>
          )}

          {/* ── Attachment previews ── */}
          {(attachedFiles.length > 0 || voiceBlob) && (
            <div style={{
              background: "#f9fafb", borderRadius: 14, padding: "12px 14px", marginBottom: 12,
              display: "flex", flexDirection: "column", gap: 8,
            }}>
              {/* File chips */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {attachedFiles.map((f, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
                    padding: "6px 12px", fontSize: "0.8rem", color: "#374151",
                  }}>
                    <span>{fileIcon(f)}</span>
                    <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                    <span style={{ fontSize: "0.7rem", color: "#9ca3af" }}>({(f.size / 1024).toFixed(0)}KB)</span>
                    <button type="button" onClick={() => removeFile(i)} style={{
                      background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 800, fontSize: "0.85rem", padding: 0, lineHeight: 1,
                    }}>✕</button>
                  </div>
                ))}
              </div>
              <div style={{ width: "100%", fontSize: "0.75rem", color: "#f59e0b", fontWeight: 600, marginTop: 4 }}>
                ⏳ Note: All attached files are automatically deleted after 1 week.
              </div>


              {/* Voice note chip with <audio> preview */}
              {voiceBlob && voiceUrl && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12,
                  padding: "8px 14px",
                }}>
                  <span style={{ fontSize: "1.1rem" }}>🎙️</span>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#374151" }}>
                      Voice note ({fmtTime(recordingTime)})
                    </span>
                    <audio controls src={voiceUrl} style={{ width: "100%", height: 32 }} />
                  </div>
                  <button type="button" onClick={cancelVoice} style={{
                    background: "none", border: "none", color: "#ef4444", cursor: "pointer",
                    fontWeight: 800, fontSize: "0.9rem", padding: 0, lineHeight: 1, flexShrink: 0,
                  }}>✕</button>
                </div>
              )}
            </div>
          )}

          {/* ── Voice recording bar ── */}
          {isRecording && (
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 14,
              padding: "12px 16px", marginBottom: 12,
            }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444", animation: "qc-pulse 1s infinite" }} />
              <span style={{ fontWeight: 700, color: "#dc2626", fontSize: "0.88rem" }}>Recording… {fmtTime(recordingTime)}</span>
              <button type="button" onClick={stopRecording} style={{
                marginLeft: "auto", background: "#dc2626", color: "#fff", border: "none",
                borderRadius: 99, padding: "8px 20px", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer",
              }}>⏹ Stop</button>
            </div>
          )}

          {/* Upload progress */}
          {uploading && uploadProgress && (
            <div style={{
              background: "#f5f3ff", borderRadius: 10, padding: "8px 14px", marginBottom: 10,
              fontSize: "0.82rem", color: "#7c3aed", fontWeight: 600,
            }}>{uploadProgress}</div>
          )}

          {/* Error */}
          {error && (
            <p style={{ color: "#dc2626", fontSize: "0.82rem", marginBottom: 10 }}>{error}</p>
          )}

          {/* ═══ CHAT INPUT BAR ═══ */}
          <div className="qc-input-bar" style={{
            display: "flex", alignItems: "center", gap: 4,
            background: "#f9fafb", borderRadius: 28, border: "1.5px solid #e5e7eb",
            padding: "4px",
            minWidth: 0,
          }}>

            {/* ── + Button (attachment menu) ── */}
            <div style={{ position: "relative" }} ref={menuRef}>
              <button
                type="button"
                onClick={() => setShowAttachMenu(!showAttachMenu)}
                disabled={isRecording}
                aria-label={showAttachMenu ? "Close attach menu" : "Attach file"}
                className="qc-icon-btn"
                style={{
                  width: 40, height: 40, borderRadius: "50%",
                  background: showAttachMenu ? "#7c3aed" : "#e5e7eb",
                  color: showAttachMenu ? "#fff" : "#6b7280",
                  border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "1.3rem", fontWeight: 800, transition: "all 0.2s",
                  transform: showAttachMenu ? "rotate(45deg)" : "none",
                  flexShrink: 0, padding: 0, lineHeight: 1,
                }}
              >+</button>

              {/* Popup menu */}
              {showAttachMenu && (
                <div style={{
                  position: "absolute", bottom: 50, left: 0,
                  background: "#fff", borderRadius: 16,
                  boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
                  border: "1px solid #e5e7eb",
                  padding: "8px 0", minWidth: 200, zIndex: 50,
                  animation: "qc-fadeInUp 0.15s ease-out",
                }}>
                  {ATTACH_MENU.map(item => (
                    <button key={item.key} type="button"
                      onClick={() => handleAttachChoice(item.accept)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        width: "100%", padding: "12px 18px",
                        background: "none", border: "none",
                        fontSize: "0.88rem", fontWeight: 600, color: "#374151",
                        cursor: "pointer", transition: "background 0.1s",
                        textAlign: "left",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#f5f3ff")}
                      onMouseLeave={e => (e.currentTarget.style.background = "none")}
                    >
                      <span style={{ fontSize: "1.2rem" }}>{item.icon}</span>
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Text input (auto-resizing, max 220px) ── */}
            <div style={{ flex: 1, minWidth: 0, position: "relative", display: "flex" }}>
              <textarea
                ref={textareaRef}
                value={responseText}
                onChange={e => {
                  if (e.target.value.length <= CHAR_LIMIT) {
                    setResponseText(e.target.value);
                  }
                }}
                placeholder="Reply…"
                disabled={isRecording}
                rows={1}
                style={{
                  width: "100%", border: "none", background: "transparent",
                  padding: "10px 8px", fontSize: "0.93rem", lineHeight: 1.4,
                  resize: "none", outline: "none", fontFamily: "inherit",
                  minHeight: 40, maxHeight: 220, overflowY: "hidden",
                  boxSizing: "border-box",
                  alignSelf: "center",
                }}
              />

              {/* Character counter */}
              {responseText.length > 0 && (
                <div style={{
                  position: "absolute", bottom: 2, right: 4,
                  fontSize: "0.68rem", fontWeight: 600,
                  color: charPercent >= 100 ? "#dc2626" : charPercent >= 90 ? "#d97706" : "#9ca3af",
                  transition: "color 0.2s",
                }}>
                  {responseText.length}/{CHAR_LIMIT}
                </div>
              )}
            </div>

            {/* ── Mic / Send button ── */}
            {hasContent ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                aria-label="Send reply"
                className="qc-icon-btn"
                style={{
                  width: 40, height: 40, borderRadius: "50%",
                  background: "linear-gradient(135deg, #7c3aed, #a855f7)",
                  color: "#fff", border: "none", cursor: submitting ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "1.1rem", transition: "all 0.2s", flexShrink: 0,
                  opacity: submitting ? 0.6 : 1,
                  padding: 0, lineHeight: 1,
                }}
              >
                {submitting ? "…" : "➤"}
              </button>
            ) : (
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                aria-label={isRecording ? "Stop recording" : "Record voice note"}
                className="qc-icon-btn"
                style={{
                  width: 40, height: 40, borderRadius: "50%",
                  background: isRecording ? "#ef4444" : "#e5e7eb",
                  color: isRecording ? "#fff" : "#6b7280",
                  border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "1.1rem", transition: "all 0.2s", flexShrink: 0,
                  padding: 0, lineHeight: 1,
                }}
              >
                🎙️
              </button>
            )}
          </div>

          {/* ── Auto-detected link pills ── */}
          {detectedLinks.length > 0 && (
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10,
            }}>
              <span style={{ fontSize: "0.72rem", color: "#9ca3af", fontWeight: 600, alignSelf: "center" }}>
                Links detected:
              </span>
              {detectedLinks.map((link, i) => (
                <a
                  key={i}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    background: "#f5f3ff", color: "#7c3aed", border: "1px solid #ddd6fe",
                    borderRadius: 99, padding: "3px 12px", fontSize: "0.76rem",
                    fontWeight: 600, textDecoration: "none", maxWidth: 220,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#ede9fe")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#f5f3ff")}
                >
                  🔗 {link.replace(/^https?:\/\//, "").substring(0, 35)}{link.replace(/^https?:\/\//, "").length > 35 ? "…" : ""}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Animation keyframes — prefixed to avoid collisions */}
      <style>{`
        @keyframes qc-fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes qc-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .swal-rounded { border-radius: 20px !important; }
        /* Beat the universal button rule in globals.css (forces padding
           6px 14px + border-radius 8px + font-size 0.75rem on every <button>).
           Without these the composer +/mic/send buttons get inflated into
           rounded pills and the input row stops aligning. */
        button.qc-icon-btn {
          padding: 0 !important;
          border-radius: 50% !important;
          font-size: 1.1rem !important;
          font-weight: 800 !important;
          line-height: 1 !important;
        }
        button.qc-composer-close {
          padding: 0 !important;
          border-radius: 50% !important;
          font-size: 0.85rem !important;
          font-weight: 600 !important;
          line-height: 1 !important;
        }
      `}</style>
    </div>
  );
}

// ── Helpers ──
function getTimeAgo(date: Date | unknown): string {
  if (!date) return "";
  const d = (date as { toDate?: () => Date })?.toDate ? (date as { toDate: () => Date }).toDate() : new Date(date as string);
  const diff = Date.now() - d.getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

import LiveTimer from "./LiveTimer";

function renderAttachment(url: string, index: number) {
  return <AttachmentPreview key={index} url={url} index={index} />;
}

function AttachmentLink({ url, index, label }: { url: string; index: number; label?: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" download
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        background: "#fff", border: "1px solid #bae6fd",
        borderRadius: 8, padding: "6px 14px",
        fontSize: "0.82rem", fontWeight: 600, color: "#0369a1",
        textDecoration: "none", width: "fit-content", marginBottom: 8
      }}
    >
      📎 {label || `View Attachment ${index + 1}`}
    </a>
  );
}

function AttachmentPreview({ url, index }: { url: string; index: number }) {
  const [errored, setErrored] = useState(false);
  const lowerUrl = url.toLowerCase();
  const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$|%3F)/i.test(lowerUrl) || /image%2F|\/image\//i.test(lowerUrl);
  const isVideo = /\.(mp4|webm|mov)(\?|$|%3F)/i.test(lowerUrl) || /video%2F|\/video\//i.test(lowerUrl);
  const isAudio = /\.(mp3|ogg|wav|m4a|webm)(\?|$|%3F)/i.test(lowerUrl) || lowerUrl.includes("voice-questions") || /audio%2F|\/audio\//i.test(lowerUrl);

  if (errored || (!isImage && !isVideo && !isAudio)) {
    return <AttachmentLink url={url} index={index} />;
  }

  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginBottom: 8 }}>
        <img
          src={url}
          alt={`Attachment ${index + 1}`}
          onError={() => setErrored(true)}
          style={{ maxWidth: "100%", maxHeight: 300, borderRadius: 8, border: "1px solid #e5e7eb" }}
        />
      </a>
    );
  }
  if (isVideo) {
    return (
      <div style={{ marginBottom: 8 }}>
        <video
          controls
          onError={() => setErrored(true)}
          style={{ maxWidth: "100%", maxHeight: 300, borderRadius: 8, border: "1px solid #e5e7eb" }}
        >
          <source src={url} />
          Your browser does not support the video tag.
        </video>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <span style={{ fontSize: "1.1rem" }}>🎙️</span>
      <audio controls src={url} onError={() => setErrored(true)} style={{ flex: 1, height: 36, borderRadius: 8 }} />
    </div>
  );
}
