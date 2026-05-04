
import { Resend } from "resend";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM || "AskExpert <noreply@askexpert.ink>";

async function test() {
  console.log("Testing Resend with key:", process.env.RESEND_API_KEY?.slice(0, 7) + "...");
  console.log("From:", FROM);
  
  if (!process.env.RESEND_API_KEY) {
    console.error("❌ RESEND_API_KEY is missing in .env.local");
    return;
  }

  try {
    const res = await resend.emails.send({
      from: FROM,
      to: "delivered@resend.dev",
      subject: "Test Email from AskExpert",
      html: "<p>This is a test email to verify Resend configuration.</p>"
    });
    
    if (res.error) {
      console.error("❌ Resend Error:", JSON.stringify(res.error, null, 2));
    } else {
      console.log("✅ Resend Success! Email ID:", res.data?.id);
    }
  } catch (e) {
    console.error("💥 Exception during send:", e);
  }
}

test();
