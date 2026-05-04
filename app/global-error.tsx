"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
    
    // Automatically show the Sentry Report Dialog
    // error.digest often contains the eventId in Next.js
    if (error.digest) {
      Sentry.showReportDialog({ eventId: error.digest });
    }
  }, [error]);

  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
