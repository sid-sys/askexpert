
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const envPath = path.resolve('.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w\.\-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.length > 0 && value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      }
      process.env[key] = value;
    }
  });
}

async function run() {
  const url = "http://localhost:3000/api/stripe/webhook";
  
  // Note: We can't easily simulate the signature without the secret
  // So we'll just test the logic by calling the session fallback instead
  // which is easier to trigger.
  
  const sessionId = "cs_test_a1W0sC36M1poGsvaTRo8wBGrwdsSMwtjBjduBvF4GE3juNQ97PJvTWTaah";
  console.log(`🔗 Triggering fallback sync for session ${sessionId}...`);
  
  try {
    const res = await fetch(`http://localhost:3000/api/stripe/session?session_id=${sessionId}`);
    const data = await res.json();
    console.log("Response:", data);
  } catch (e) {
    console.error("Fetch failed (is the server running?):", e.message);
  }
}

run();
