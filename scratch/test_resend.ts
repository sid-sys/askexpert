import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Resend } from "resend";

// Load env vars
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM || "AskExpert <noreply@askexpert.ink>";

async function testEmail() {
  const recipient = "sidharthbabu96@gmail.com"; // Testing with user's email from git log
  console.log(`🧪 Testing Resend with API Key: ${process.env.RESEND_API_KEY?.slice(0, 7)}...`);
  console.log(`📤 From: ${FROM}`);
  console.log(`📥 To: ${recipient}`);

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: recipient,
      subject: "Test Email from AskExpert",
      html: "<h1>It works!</h1><p>If you see this, Resend integration is functioning correctly.</p>",
    });

    if (error) {
      console.error("❌ Resend Error:", JSON.stringify(error, null, 2));
      if (error.name === "validation_error" || error.message?.includes("domain")) {
         console.warn("💡 Hint: Your domain might not be verified. Try setting RESEND_FROM to 'onboarding@resend.dev' in .env.local");
      }
    } else {
      console.log("✅ Resend Success! ID:", data?.id);
    }
  } catch (err) {
    console.error("💥 Fatal Error:", err);
  }
}

testEmail();
