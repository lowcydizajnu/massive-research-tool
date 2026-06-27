"use client";

// Root error boundary (platform-foundation PF1.1, ADR-0072). Next.js renders
// this when an error escapes the root layout — it replaces the whole document,
// so it carries its own <html>/<body> and can't rely on app CSS/tokens being
// loaded (hence inline styles). It reports the error to Sentry and offers a
// reload.
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          background: "#f6f3ec",
          color: "#1c1a17",
        }}
      >
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontFamily: "'IBM Plex Serif', Georgia, serif", fontSize: 24, fontWeight: 500, margin: "0 0 8px" }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, color: "#6b6457", margin: "0 0 20px" }}>
            An unexpected error occurred and our team has been notified. Try again, or reload the page.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 500,
              color: "#fff",
              background: "#047144",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
