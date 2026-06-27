// Next.js instrumentation hook (platform-foundation PF1.1, ADR-0072). Loads the
// runtime-appropriate Sentry config, and forwards nested-RSC render errors to
// Sentry via onRequestError (the App Router server-error hook).
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
