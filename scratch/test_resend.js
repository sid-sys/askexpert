
import { Resend } from "resend";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM || "AskExpert <noreply@askexpert.ink>";

async function test() {
  console.log("Testing Resend with key:", process.env.RESEND_API_KEY?.slice(0, 7) + "...");
  console.log("From:", FROM);
  
  try {
    const res = await resend.emails.send({
      from: FROM,
      to: "delivered@resend.dev", // Special test email for Resend
      subject: "Test Email",
      html: "<p>Test</p>"
    });
    
    if (res.error) {
      console.error("❌ Error:", JSON.stringify(res.error, null, 2));
    } else {
      console.log("✅ Success:", res.data);
    }
  } catch (e) {
    console.error("💥 Exception:", e);
  }
}

test();
