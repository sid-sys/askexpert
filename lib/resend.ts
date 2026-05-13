import { Resend } from "resend";
import { AnswerType } from "./types";
import { adminDb, FieldValue } from "./firebase-admin";
import { formatDuration } from "./utils";

export const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const FROM = process.env.RESEND_FROM || "AskExpert <contact@askexpert.ink>";

// ── Audit Helper ─────────────────────────────────────────────────────────────
async function logNotification(data: {
  to: string;
  subject: string;
  type: string;
  status: "success" | "error";
  error?: any;
  metadata?: any;
}) {
  try {
    await adminDb.collection("notificationAudit").add({
      ...data,
      timestamp: FieldValue.serverTimestamp(),
      env: process.env.NODE_ENV,
    });
  } catch (err) {
    console.error("❌ Failed to log notification audit:", err);
  }
}

// ── Shared template wrapper ──────────────────────────────────────────────────
function emailWrapper(content: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width" />
<title>AskExpert</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 4px 40px rgba(0,0,0,0.08);">
    <!-- Header -->
    <div style="background:#000;padding:28px 40px;display:flex;align-items:center;gap:14px;">
      <img src="${APP_URL}/logo.png" alt="AskExpert" width="44" height="44" style="display:block;border-radius:10px;" />
      <div>
        <div style="font-size:1.5rem;font-weight:900;color:#fff;letter-spacing:-0.5px;">AskExpert</div>
        <div style="color:rgba(255,255,255,0.75);font-size:0.85rem;margin-top:2px;">Expert answers, delivered.</div>
      </div>
    </div>
    <!-- Body -->
    <div style="padding:40px;">
      ${content}
    </div>
    <!-- Footer -->
    <div style="padding:24px 40px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="color:#9ca3af;font-size:0.78rem;margin:0;">
        You received this because you used AskExpert. 
        <a href="${APP_URL}" style="color:#7c3aed;">Visit AskExpert</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ── Email privacy helper ─────────────────────────────────────────────────────
function maskEmail(email: string | undefined | null): string {
  if (!email) return "anonymous@askexpert.ink";
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(3, local.length - 2))}@${domain}`;
}

// ── 1. New question → notify creator ────────────────────────────────────────
export async function sendNewQuestionEmail({
  to,
  creatorName,
  question,
  askerEmail,
  askerName,
  price,
  category,
  requestedReplyFormat,
  dashboardUrl,
  responseTimeHours,
  attachmentUrls,
}: {
  to: string;
  creatorName: string;
  question: string;
  askerEmail: string;
  askerName?: string;
  price: number;
  category?: string;
  requestedReplyFormat?: string;
  dashboardUrl?: string;
  responseTimeHours?: number;
  attachmentUrls?: string[];
}) {
  const askerLabel = askerName?.trim() || maskEmail(askerEmail);
  try {
    const replyTag = requestedReplyFormat && requestedReplyFormat !== "text"
      ? `<span style="display:inline-block;background:#f5f3ff;color:#7c3aed;border-radius:99px;padding:3px 12px;font-size:0.78rem;font-weight:700;margin-bottom:16px;">
          ${requestedReplyFormat === "audio" ? "🎙" : requestedReplyFormat === "video" ? "🎥" : "📹"} Reply requested as ${requestedReplyFormat}
        </span>`
      : "";

    const content = `
      <h2 style="font-size:1.4rem;font-weight:800;color:#1f2937;margin:0 0 8px;">You have a new question! 🎉</h2>
      <p style="color:#6b7280;font-size:0.92rem;margin:0 0 28px;">Hi ${creatorName}, someone just paid to ask you a question.</p>

      ${replyTag}

      ${category ? `<div style="display:inline-block;background:#faf5ff;color:#7c3aed;border-radius:8px;padding:4px 12px;font-size:0.78rem;font-weight:600;margin-bottom:16px;">${category}</div>` : ""}

      <div style="background:#f5f3ff;border-left:4px solid #7c3aed;border-radius:0 12px 12px 0;padding:20px 24px;margin-bottom:24px;">
        <div style="font-size:0.75rem;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">Their question</div>
        <p style="font-size:1rem;color:#1f2937;line-height:1.65;margin:0;font-style:italic;">"${question}"</p>
        
        ${attachmentUrls && attachmentUrls.length > 0 ? `
          <div style="margin-top:16px;padding-top:16px;border-top:1px solid #ddd6fe;">
            <div style="font-size:0.7rem;font-weight:700;color:#7c3aed;text-transform:uppercase;margin-bottom:8px;">Attachments</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;">
              ${attachmentUrls.map((url, i) => {
                const isImage = url.toLowerCase().includes("image") || /\\.(jpg|jpeg|png|gif|webp)(\\?|$)/i.test(url);
                if (isImage) {
                  return '<a href="' + url + '" target="_blank" style="display:block;margin-bottom:8px;"><img src="' + url + '" style="max-width:100%;max-height:200px;border-radius:8px;border:1px solid #c4b5fd;"/></a>';
                }
                return '<a href="' + url + '" style="display:inline-block;background:#ede9fe;color:#7c3aed;border-radius:8px;padding:6px 12px;font-size:0.8rem;text-decoration:none;border:1px solid #c4b5fd;">📎 View Attachment ' + (i + 1) + '</a>';
              }).join("")}
            </div>
          </div>
        ` : ""}
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;background:#f9fafb;border-radius:12px;padding:16px 20px;margin-bottom:28px;">
        <div>
          <div style="font-size:0.75rem;color:#9ca3af;font-weight:600;text-transform:uppercase;margin-bottom:4px;">From</div>
          <div style="font-size:0.9rem;color:#374151;font-weight:600;">${askerLabel}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:0.75rem;color:#9ca3af;font-weight:600;text-transform:uppercase;margin-bottom:4px;">Paid</div>
          <div style="font-size:1.2rem;color:#7c3aed;font-weight:900;">$${(price / 100).toFixed(2)}</div>
        </div>
      </div>

      <a href="${dashboardUrl || APP_URL + "/dashboard"}"
        style="display:block;background:#7c3aed;color:#fff;text-align:center;padding:16px 24px;border-radius:99px;font-weight:700;font-size:0.95rem;text-decoration:none;">
        Answer Now →
      </a>
      <p style="text-align:center;color:#9ca3af;font-size:0.78rem;margin-top:12px;">⏳ Auto-refunded 3 minutes after your ${formatDuration(responseTimeHours || 72)} response time.</p>
    `;

    const res = await resend.emails.send({
      from: FROM,
      to,
      subject: `💬 New question from ${askerLabel} — $${(price / 100).toFixed(2)} earned`,
      html: emailWrapper(content),
    });

    if (res.error) {
      console.error("❌ Resend error (New Question):", res.error);
      await logNotification({ to, subject: "New Question", type: "creator_notification", status: "error", error: res.error });
    } else {
      await logNotification({ to, subject: "New Question", type: "creator_notification", status: "success", metadata: { resendId: res.data?.id } });
    }
    return res;
  } catch (err: any) {
    console.error("💥 CRASH (New Question):", err);
    await logNotification({ to, subject: "New Question", type: "creator_notification", status: "error", error: { message: err.message } });
    throw err;
  }
}

// ── 2. Answer → notify asker ─────────────────────────────────────────────────
export async function sendAnswerEmail({
  to,
  creatorName,
  question,
  answer,
  answerType = "text",
  answerUrl,
  attachmentUrls = [],
}: {
  to: string;
  creatorName: string;
  question: string;
  answer: string;
  answerType?: AnswerType;
  answerUrl?: string;
  attachmentUrls?: string[];
}) {
  try {
    let answerBlock = "";

    if (answerType === "text") {
      answerBlock = `<p style="font-size:1rem;color:#1f2937;line-height:1.7;margin:0;">${answer}</p>`;
    } else if (answerType === "link") {
      answerBlock = `
        <p style="font-size:1rem;color:#1f2937;line-height:1.7;margin:0 0 12px;">${answer}</p>
        ${answerUrl ? `<a href="${answerUrl}" style="color:#7c3aed;font-weight:700;">🔗 Open link</a>` : ""}`;
    } else if (answerType === "image") {
      answerBlock = `
        ${answer ? `<p style="font-size:1rem;color:#1f2937;margin:0 0 12px;">${answer}</p>` : ""}
        ${answerUrl ? `<img src="${answerUrl}" alt="Answer image" style="max-width:100%;border-radius:12px;margin-top:8px;" />` : ""}`;
    } else if (answerType === "audio") {
      answerBlock = `
        <p style="font-size:1rem;color:#1f2937;margin:0 0 12px;">${answer || "Your creator recorded an audio answer."}</p>
        ${answerUrl ? `<a href="${answerUrl}" style="display:inline-block;background:#f5f3ff;color:#7c3aed;border-radius:99px;padding:10px 20px;font-weight:700;text-decoration:none;">🎙 Listen to Audio Answer</a>` : ""}`;
    } else if (answerType === "file") {
      answerBlock = `
        <p style="font-size:1rem;color:#1f2937;margin:0 0 12px;">${answer || "Your creator shared a file."}</p>
        ${answerUrl ? `<a href="${answerUrl}" style="display:inline-block;background:#f5f3ff;color:#7c3aed;border-radius:99px;padding:10px 20px;font-weight:700;text-decoration:none;">📎 View File</a>` : ""}`;
    }

    let attachmentsBlock = "";
    if (attachmentUrls && attachmentUrls.length > 0) {
      attachmentsBlock = `
        <div style="margin-top:24px;padding-top:20px;border-top:1px solid #e5e7eb;">
          <div style="font-size:0.75rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px;">Attachments</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${attachmentUrls.map((url, i) => {
              const fileName = url.split("/").pop()?.split("?")[0] || `Attachment ${i + 1}`;
              const isImage = url.toLowerCase().includes("image") || /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url);
              if (isImage) {
                return `
                  <a href="${url}" target="_blank" style="display:block;margin-bottom:8px;">
                    <img src="${url}" alt="Attachment" style="max-width:100%;max-height:200px;border-radius:8px;border:1px solid #e5e7eb;"/>
                  </a>
                `;
              }
              return `
                <a href="${url}" target="_blank" style="display:inline-block;background:#f3f4f6;color:#374151;border-radius:8px;padding:8px 12px;font-size:0.85rem;text-decoration:none;border:1px solid #e5e7eb;width:max-content;">
                  📎 ${fileName.length > 30 ? fileName.slice(0,27) + '...' : fileName}
                </a>
              `;
            }).join("")}
          </div>
        </div>
      `;
    }

    const content = `
      <h2 style="font-size:1.4rem;font-weight:800;color:#1f2937;margin:0 0 8px;">Your question was answered! ✅</h2>
      <p style="color:#6b7280;font-size:0.92rem;margin:0 0 28px;">${creatorName} took the time to personally answer your question.</p>

      <div style="background:#f9fafb;border-radius:12px;padding:20px 24px;margin-bottom:20px;">
        <div style="font-size:0.75rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Your question</div>
        <p style="font-size:0.95rem;color:#374151;line-height:1.6;margin:0;font-style:italic;">"${question}"</p>
      </div>

      <div style="background:#f5f3ff;border-left:4px solid #7c3aed;border-radius:0 12px 12px 0;padding:24px;margin-bottom:28px;">
        <div style="font-size:0.75rem;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px;">
          Answer from ${creatorName}
          ${answerType !== "text" ? `<span style="margin-left:8px;background:#7c3aed;color:#fff;border-radius:99px;padding:2px 10px;font-size:0.7rem;">${answerType.toUpperCase()}</span>` : ""}
        </div>
        ${answerBlock}
        ${attachmentsBlock}
      </div>

      <a href="${APP_URL}" style="display:block;background:#7c3aed;color:#fff;text-align:center;padding:16px 24px;border-radius:99px;font-weight:700;font-size:0.95rem;text-decoration:none;">
        Ask Another Question →
      </a>
    `;

    const res = await resend.emails.send({
      from: FROM,
      to,
      subject: `${creatorName} answered your question!`,
      html: emailWrapper(content),
    });

    if (res.error) {
      console.error("❌ Resend error (Answer):", res.error);
      await logNotification({ to, subject: "Question Answered", type: "asker_notification", status: "error", error: res.error });
    } else {
      await logNotification({ to, subject: "Question Answered", type: "asker_notification", status: "success", metadata: { resendId: res.data?.id } });
    }
    return res;
  } catch (err: any) {
    console.error("💥 CRASH (Answer):", err);
    await logNotification({ to, subject: "Question Answered", type: "asker_notification", status: "error", error: { message: err.message } });
    throw err;
  }
}

// ── 3. Refund email ───────────────────────────────────────────────────────────
export async function sendRefundEmail({
  to,
  creatorName,
  question,
  responseTimeHours,
}: {
  to: string;
  creatorName: string;
  question: string;
  responseTimeHours?: number;
}) {
  try {
    const content = `
      <h2 style="font-size:1.4rem;font-weight:800;color:#1f2937;margin:0 0 8px;">Your question was refunded ↩</h2>
      <p style="color:#6b7280;font-size:0.92rem;margin:0 0 28px;">
        ${creatorName} didn't answer your question within the ${formatDuration(responseTimeHours || 72)} window, so your payment has been fully refunded.
      </p>

      <div style="background:#f9fafb;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
        <div style="font-size:0.75rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Your question</div>
        <p style="font-size:0.95rem;color:#374151;line-height:1.6;margin:0;font-style:italic;">"${question}"</p>
      </div>

      <div style="background:#f0fdf4;border-radius:12px;padding:16px 20px;margin-bottom:28px;display:flex;align-items:center;gap:12px;">
        <span style="font-size:1.5rem;">✅</span>
        <div>
          <div style="font-weight:700;color:#059669;">Full refund issued</div>
          <div style="color:#6b7280;font-size:0.85rem;">Allow 5-10 business days to appear on your statement.</div>
        </div>
      </div>

      <a href="${APP_URL}" style="display:block;background:#7c3aed;color:#fff;text-align:center;padding:16px 24px;border-radius:99px;font-weight:700;font-size:0.95rem;text-decoration:none;">
        Try Another Expert →
      </a>
    `;

    const res = await resend.emails.send({
      from: FROM,
      to,
      subject: `Your question to ${creatorName} was refunded`,
      html: emailWrapper(content),
    });

    if (res.error) {
      await logNotification({ to, subject: "Question Refunded", type: "asker_notification", status: "error", error: res.error });
    } else {
      await logNotification({ to, subject: "Question Refunded", type: "asker_notification", status: "success", metadata: { resendId: res.data?.id } });
    }
    return res;
  } catch (err: any) {
    await logNotification({ to, subject: "Question Refunded", type: "asker_notification", status: "error", error: { message: err.message } });
    throw err;
  }
}

// ── 4. Question submitted → confirm to asker ──────────────────────────────────
export async function sendAskerConfirmationEmail({
  to,
  creatorName,
  question,
  price,
  currency = "usd",
  responseTimeHours,
  expiresAt,
}: {
  to: string;
  creatorName: string;
  question: string;
  price: number;
  currency?: string;
  responseTimeHours?: number;
  expiresAt?: Date | string;
}) {
  try {
    const priceFormatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(price / 100);

    const timeWindow = formatDuration(responseTimeHours || 72);

    const content = `
      <h2 style="font-size:1.4rem;font-weight:800;color:#1f2937;margin:0 0 8px;">Question received! 🎉</h2>
      <p style="color:#6b7280;font-size:0.92rem;margin:0 0 28px;">
        Hi there! Your question has been submitted to <strong style="color:#1f2937;">${creatorName}</strong>
        and your payment is confirmed. We'll email you as soon as they reply.
      </p>

      <div style="background:#f5f3ff;border-left:4px solid #7c3aed;border-radius:0 12px 12px 0;padding:20px 24px;margin-bottom:24px;">
        <div style="font-size:0.75rem;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">Your question</div>
        <p style="font-size:1rem;color:#1f2937;line-height:1.65;margin:0;font-style:italic;">"${question.slice(0, 300)}${question.length > 300 ? "…" : ""}"</p>
      </div>

      <div style="display:flex;gap:12px;margin-bottom:28px;">
        <div style="flex:1;background:#f9fafb;border-radius:12px;padding:16px;text-align:center;">
          <div style="font-size:0.72rem;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Paid</div>
          <div style="font-size:1.3rem;font-weight:900;color:#7c3aed;">${priceFormatted}</div>
        </div>
        <div style="flex:1;background:#fffbeb;border-radius:12px;padding:16px;text-align:center;">
          <div style="font-size:0.72rem;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Response window</div>
          <div style="font-size:1.1rem;font-weight:900;color:#d97706;">${timeWindow}</div>
        </div>
        <div style="flex:1;background:#f0fdf4;border-radius:12px;padding:16px;text-align:center;">
          <div style="font-size:0.72rem;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Refund policy</div>
          <div style="font-size:1rem;font-weight:900;color:#059669;">Auto ✓</div>
        </div>
      </div>

      <div style="background:#f9fafb;border-radius:12px;padding:18px 20px;margin-bottom:28px;">
        <div style="font-size:0.75rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px;">What happens next</div>
        <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;">
          <span style="font-size:1rem;flex-shrink:0;">✉️</span>
          <span style="font-size:0.87rem;color:#374151;line-height:1.5;">You'll receive the full answer in your inbox — no login needed.</span>
        </div>
        <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;">
          <span style="font-size:1rem;flex-shrink:0;">⏰</span>
          <span style="font-size:0.87rem;color:#374151;line-height:1.5;">If ${creatorName} doesn't reply within ${timeWindow}, you'll be automatically refunded.</span>
        </div>
        <div style="display:flex;align-items:flex-start;gap:10px;">
          <span style="font-size:1rem;flex-shrink:0;">🔒</span>
          <span style="font-size:0.87rem;color:#374151;line-height:1.5;">Your email is never shared with the creator.</span>
        </div>
      </div>

      <a href="${APP_URL}" style="display:block;background:#7c3aed;color:#fff;text-align:center;padding:16px 24px;border-radius:99px;font-weight:700;font-size:0.95rem;text-decoration:none;">
        Visit AskExpert →
      </a>
    `;

    const res = await resend.emails.send({
      from: FROM,
      to,
      subject: `✅ Question submitted to ${creatorName} — ${priceFormatted} paid`,
      html: emailWrapper(content),
    });

    if (res.error) {
      console.error("❌ Resend error (Confirmation):", res.error);
      await logNotification({ to, subject: "Question Confirmation", type: "asker_confirmation", status: "error", error: res.error });
    } else {
      await logNotification({ to, subject: "Question Confirmation", type: "asker_confirmation", status: "success", metadata: { resendId: res.data?.id } });
    }
    return res;
  } catch (err: any) {
    console.error("💥 CRASH (Confirmation):", err);
    await logNotification({ to, subject: "Question Confirmation", type: "asker_confirmation", status: "error", error: { message: err.message } });
    throw err;
  }
}

export async function sendFeedbackEmail({
  type,
  message,
  email,
  name,
  rating,
  url,
}: {
  type: string;
  message: string;
  email?: string;
  name?: string;
  rating?: number;
  url?: string;
}) {
  try {
    const content = `
      <div style="background:#f3f4f6;padding:32px;border-radius:24px;color:#1f2937;font-family:'Inter',sans-serif;">
        <h2 style="color:#7c3aed;margin-top:0;font-size:1.5rem;font-weight:800;">
          New ${type === "bug" ? "Bug Report 🐞" : "Feedback 💬"}
        </h2>
        
        <div style="background:#fff;padding:24px;border-radius:16px;margin:24px 0;box-shadow:0 4px 12px rgba(0,0,0,0.05);">
          <p style="font-size:1.1rem;line-height:1.6;white-space:pre-wrap;margin:0;color:#374151;">"${message}"</p>
        </div>

        <div style="display:flex;gap:16px;">
          <div style="flex:1;background:#fff;padding:16px;border-radius:12px;border:1px solid #e5e7eb;">
            <div style="font-size:0.7rem;font-weight:800;color:#9ca3af;text-transform:uppercase;margin-bottom:4px;">From</div>
            <div style="font-weight:700;color:#1f2937;">${name || "Anonymous"}</div>
            <div style="font-size:0.85rem;color:#6b7280;">${email || "No email provided"}</div>
          </div>
          
          ${type === "feedback" ? `
          <div style="flex:1;background:#fff;padding:16px;border-radius:12px;border:1px solid #e5e7eb;">
            <div style="font-size:0.7rem;font-weight:800;color:#9ca3af;text-transform:uppercase;margin-bottom:4px;">Rating</div>
            <div style="font-size:1.2rem;">${"⭐".repeat(rating || 0)}</div>
          </div>
          ` : ""}
        </div>

        <div style="margin-top:20px;padding:12px 16px;background:#f9fafb;border-radius:10px;font-size:0.8rem;color:#9ca3af;">
          📍 Sent from: <a href="${APP_URL}${url}" style="color:#7c3aed;text-decoration:none;">${url || "/"}</a>
        </div>
      </div>
    `;

    return await resend.emails.send({
      from: FROM,
      to: "contact@askexpert.ink",
      subject: `[AskExpert] ${type === "bug" ? "🐞 Bug" : "💬 Feedback"} from ${name || "User"}`,
      html: emailWrapper(content),
    });
  } catch (err) {
    console.error("❌ Feedback email failed:", err);
    throw err;
  }
}

// ── 5. Payout notification → notify creator ──────────────────────────────────
export async function sendPayoutEmail({
  to,
  amount,
  method,
  reference,
}: {
  to: string;
  amount: number;
  method: string;
  reference: string;
}) {
  try {
    const content = `
      <h2 style="font-size:1.4rem;font-weight:800;color:#1f2937;margin:0 0 8px;">Your payout is on the way! 💸</h2>
      <p style="color:#6b7280;font-size:0.92rem;margin:0 0 28px;">Good news! We've processed your payout request.</p>

      <div style="background:#f0fdf4;border-radius:12px;padding:24px;margin-bottom:28px;text-align:center;">
        <div style="font-size:0.75rem;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Amount Paid</div>
        <div style="font-size:2rem;font-weight:900;color:#059669;">$${(amount / 100).toFixed(2)}</div>
      </div>

      <div style="background:#f9fafb;border-radius:12px;padding:18px 20px;margin-bottom:28px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
          <span style="color:#9ca3af;font-size:0.85rem;">Method</span>
          <span style="color:#1f2937;font-weight:700;font-size:0.85rem;">${method}</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#9ca3af;font-size:0.85rem;">Reference</span>
          <span style="color:#1f2937;font-weight:700;font-size:0.85rem;">${reference}</span>
        </div>
      </div>

      <p style="color:#6b7280;font-size:0.85rem;line-height:1.5;margin-bottom:28px;">
        Funds usually arrive within 1-3 business days depending on your bank or payment provider. 
        If you don't see the funds after 5 days, please contact support.
      </p>

      <a href="${APP_URL}/dashboard" style="display:block;background:#7c3aed;color:#fff;text-align:center;padding:16px 24px;border-radius:99px;font-weight:700;font-size:0.95rem;text-decoration:none;">
        Back to Dashboard →
      </a>
    `;

    const res = await resend.emails.send({
      from: FROM,
      to,
      subject: `💸 Payout Sent: $${(amount / 100).toFixed(2)} is on the way!`,
      html: emailWrapper(content),
    });

    if (res.error) {
      await logNotification({ to, subject: "Payout Sent", type: "payout_notification", status: "error", error: res.error });
    } else {
      await logNotification({ to, subject: "Payout Sent", type: "payout_notification", status: "success", metadata: { resendId: res.data?.id } });
    }
    return res;
  } catch (err: any) {
    await logNotification({ to, subject: "Payout Sent", type: "payout_notification", status: "error", error: { message: err.message } });
    throw err;
  }
}

// ── 6. Payout cancelled → notify creator ─────────────────────────────────────
export async function sendPayoutCancelledEmail({
  to,
  amount,
  reason,
}: {
  to: string;
  amount: number;
  reason?: string;
}) {
  try {
    const content = `
      <h2 style="font-size:1.4rem;font-weight:800;color:#1f2937;margin:0 0 8px;">Payout request rejected ❌</h2>
      <p style="color:#6b7280;font-size:0.92rem;margin:0 0 28px;">Your payout request for $${(amount / 100).toFixed(2)} was not approved.</p>

      <div style="background:#fee2e2;border-radius:12px;padding:20px 24px;margin-bottom:28px;">
        <div style="font-size:0.75rem;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Reason</div>
        <p style="font-size:0.95rem;color:#374151;line-height:1.6;margin:0;">${reason || "Please ensure your bank details are correct or contact support for more details."}</p>
      </div>

      <p style="color:#6b7280;font-size:0.85rem;line-height:1.5;margin-bottom:28px;">
        The funds have been returned to your <strong>Pending Balance</strong> in your dashboard. You can update your payout details and try again.
      </p>

      <a href="${APP_URL}/dashboard" style="display:block;background:#7c3aed;color:#fff;text-align:center;padding:16px 24px;border-radius:99px;font-weight:700;font-size:0.95rem;text-decoration:none;">
        View Dashboard →
      </a>
    `;

    const res = await resend.emails.send({
      from: FROM,
      to,
      subject: `❌ Payout Update: Your request for $${(amount / 100).toFixed(2)} was rejected`,
      html: emailWrapper(content),
    });

    if (res.error) {
      await logNotification({ to, subject: "Payout Rejected", type: "payout_notification", status: "error", error: res.error });
    } else {
      await logNotification({ to, subject: "Payout Rejected", type: "payout_notification", status: "success", metadata: { resendId: res.data?.id } });
    }
    return res;
  } catch (err: any) {
    await logNotification({ to, subject: "Payout Rejected", type: "payout_notification", status: "error", error: { message: err.message } });
    throw err;
  }
}

// ── 7. Vacation return → notify subscribers ────────────────────────────────
export async function sendVacationReturnEmail({
  to,
  creatorName,
  creatorUsername,
}: {
  to: string;
  creatorName: string;
  creatorUsername: string;
}) {
  try {
    const profileUrl = `${APP_URL}/${creatorUsername}`;
    const content = `
      <h2 style="font-size:1.4rem;font-weight:800;color:#1f2937;margin:0 0 8px;">${creatorName} is back! 🎊</h2>
      <p style="color:#6b7280;font-size:0.92rem;margin:0 0 28px;">
        You asked to be notified when ${creatorName} returns from vacation. The wait is over!
      </p>

      <div style="background:#f5f3ff;border-radius:16px;padding:24px;text-align:center;margin-bottom:28px;">
        <div style="font-size:3rem;margin-bottom:16px;">✨</div>
        <p style="font-size:1.1rem;color:#1f2937;font-weight:700;margin:0 0 8px;">Ready to answer your questions</p>
        <p style="font-size:0.9rem;color:#6b7280;margin:0;">${creatorName} is now active and accepting new requests.</p>
      </div>

      <a href="${profileUrl}" 
        style="display:block;background:#7c3aed;color:#fff;text-align:center;padding:16px 24px;border-radius:99px;font-weight:700;font-size:0.95rem;text-decoration:none;">
        Ask ${creatorName} a Question →
      </a>
      
      <p style="text-align:center;color:#9ca3af;font-size:0.78rem;margin-top:20px;">
        You are receiving this because you signed up for notifications on ${creatorName}'s profile.
      </p>
    `;

    const res = await resend.emails.send({
      from: FROM,
      to,
      subject: `🎊 ${creatorName} is back on AskExpert!`,
      html: emailWrapper(content),
    });

    if (res.error) {
      await logNotification({ to, subject: "Vacation Return", type: "subscriber_notification", status: "error", error: res.error });
    } else {
      await logNotification({ to, subject: "Vacation Return", type: "subscriber_notification", status: "success", metadata: { resendId: res.data?.id } });
    }
    return res;
  } catch (err: any) {
    await logNotification({ to, subject: "Vacation Return", type: "subscriber_notification", status: "error", error: { message: err.message } });
    throw err;
  }
}

// ── 9. Subscription confirmation → notify fan (subscriber) ───────────────────
export async function sendSubscriptionConfirmationEmail({
  to,
  creatorName,
  creatorUsername,
  price,
  currency = "usd",
}: {
  to: string;
  creatorName: string;
  creatorUsername?: string;
  price: number;
  currency?: string;
}) {
  try {
    const priceFormatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(price / 100);

    const profileUrl = creatorUsername ? `${APP_URL}/${creatorUsername}` : APP_URL;

    const content = `
      <h2 style="font-size:1.4rem;font-weight:800;color:#1f2937;margin:0 0 8px;">You're subscribed! 🌟</h2>
      <p style="color:#6b7280;font-size:0.92rem;margin:0 0 28px;">
        Your monthly subscription to <strong style="color:#1f2937;">${creatorName}</strong> is now active.
        Ask them anything — your questions are included for the next 30 days.
      </p>

      <div style="background:#f5f3ff;border-left:4px solid #7c3aed;border-radius:0 12px 12px 0;padding:20px 24px;margin-bottom:24px;">
        <div style="font-size:0.75rem;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">Plan</div>
        <p style="font-size:1rem;color:#1f2937;line-height:1.65;margin:0;font-weight:700;">${creatorName} — Monthly Subscription</p>
        <p style="font-size:0.85rem;color:#6b7280;margin:6px 0 0;">Renews automatically every 30 days. Cancel anytime from your dashboard.</p>
      </div>

      <div style="display:flex;gap:12px;margin-bottom:28px;">
        <div style="flex:1;background:#f9fafb;border-radius:12px;padding:16px;text-align:center;">
          <div style="font-size:0.72rem;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Paid today</div>
          <div style="font-size:1.3rem;font-weight:900;color:#7c3aed;">${priceFormatted}</div>
        </div>
        <div style="flex:1;background:#fffbeb;border-radius:12px;padding:16px;text-align:center;">
          <div style="font-size:0.72rem;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Status</div>
          <div style="font-size:1rem;font-weight:900;color:#d97706;">Active ✓</div>
        </div>
        <div style="flex:1;background:#f0fdf4;border-radius:12px;padding:16px;text-align:center;">
          <div style="font-size:0.72rem;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Questions</div>
          <div style="font-size:1rem;font-weight:900;color:#059669;">Unlimited</div>
        </div>
      </div>

      <a href="${profileUrl}" style="display:block;background:#7c3aed;color:#fff;text-align:center;padding:16px 24px;border-radius:99px;font-weight:700;font-size:0.95rem;text-decoration:none;margin-bottom:10px;">
        Ask ${creatorName} a Question →
      </a>
      <a href="${APP_URL}/fan-dashboard" style="display:block;color:#7c3aed;text-align:center;padding:10px;font-weight:600;font-size:0.85rem;text-decoration:none;">
        Manage your subscriptions
      </a>
    `;

    const res = await resend.emails.send({
      from: FROM,
      to,
      subject: `🌟 Subscription confirmed — ${creatorName}`,
      html: emailWrapper(content),
    });

    if (res.error) {
      await logNotification({ to, subject: "Subscription Confirmed", type: "subscriber_notification", status: "error", error: res.error });
    } else {
      await logNotification({ to, subject: "Subscription Confirmed", type: "subscriber_notification", status: "success", metadata: { resendId: res.data?.id } });
    }
    return res;
  } catch (err: any) {
    await logNotification({ to, subject: "Subscription Confirmed", type: "subscriber_notification", status: "error", error: { message: err.message } });
    throw err;
  }
}

// ── 10. New subscriber → notify creator ──────────────────────────────────────
export async function sendNewSubscriberEmail({
  to,
  creatorName,
  subscriberEmail,
  subscriberName,
  price,
  currency = "usd",
  dashboardUrl,
}: {
  to: string;
  creatorName: string;
  subscriberEmail: string;
  subscriberName?: string;
  price: number;
  currency?: string;
  dashboardUrl?: string;
}) {
  try {
    const priceFormatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(price / 100);

    const subscriberLabel = subscriberName?.trim() || maskEmail(subscriberEmail);
    const fansUrl = dashboardUrl || `${APP_URL}/fans`;

    const content = `
      <h2 style="font-size:1.4rem;font-weight:800;color:#1f2937;margin:0 0 8px;">You have a new subscriber! 🌟</h2>
      <p style="color:#6b7280;font-size:0.92rem;margin:0 0 28px;">
        Hi ${creatorName}, <strong style="color:#1f2937;">${subscriberLabel}</strong> just subscribed to your monthly plan.
        They can now ask you unlimited questions for the next 30 days.
      </p>

      <div style="display:flex;justify-content:space-between;align-items:center;background:#f9fafb;border-radius:12px;padding:16px 20px;margin-bottom:28px;">
        <div>
          <div style="font-size:0.75rem;color:#9ca3af;font-weight:600;text-transform:uppercase;margin-bottom:4px;">Subscriber</div>
          <div style="font-size:0.9rem;color:#374151;font-weight:600;">${subscriberLabel}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:0.75rem;color:#9ca3af;font-weight:600;text-transform:uppercase;margin-bottom:4px;">Monthly</div>
          <div style="font-size:1.2rem;color:#7c3aed;font-weight:900;">${priceFormatted}</div>
        </div>
      </div>

      <a href="${fansUrl}"
        style="display:block;background:#7c3aed;color:#fff;text-align:center;padding:16px 24px;border-radius:99px;font-weight:700;font-size:0.95rem;text-decoration:none;">
        View Your Fans →
      </a>
      <p style="text-align:center;color:#9ca3af;font-size:0.78rem;margin-top:12px;">You'll be notified when they send their first question.</p>
    `;

    const res = await resend.emails.send({
      from: FROM,
      to,
      subject: `🌟 New subscriber — ${subscriberLabel} (${priceFormatted}/mo)`,
      html: emailWrapper(content),
    });

    if (res.error) {
      await logNotification({ to, subject: "New Subscriber", type: "creator_notification", status: "error", error: res.error });
    } else {
      await logNotification({ to, subject: "New Subscriber", type: "creator_notification", status: "success", metadata: { resendId: res.data?.id } });
    }
    return res;
  } catch (err: any) {
    await logNotification({ to, subject: "New Subscriber", type: "creator_notification", status: "error", error: { message: err.message } });
    throw err;
  }
}
