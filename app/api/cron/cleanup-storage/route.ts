import { NextResponse } from "next/server";
import { adminStorage } from "@/lib/firebase-admin";

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  
  // Require Bearer token authentication matching the CRON_SECRET environment variable
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized: Invalid or missing Bearer token", { status: 401 });
  }

  try {
    const bucket = adminStorage.bucket();
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    let deletedCount = 0;
    
    // We will check prefixes that we want to clean up
    const prefixes = ["asker_attachments/", "answers/"];

    for (const prefix of prefixes) {
      const [files] = await bucket.getFiles({ prefix });
      
      for (const file of files) {
        const [metadata] = await file.getMetadata();
        if (metadata.timeCreated) {
          const fileCreatedDate = new Date(metadata.timeCreated);
          if (fileCreatedDate < oneWeekAgo) {
            await file.delete();
            deletedCount++;
          }
        }
      }
    }

    return NextResponse.json({ success: true, deletedCount });
  } catch (err: any) {
    console.error("Cron Error (cleanup-storage):", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
