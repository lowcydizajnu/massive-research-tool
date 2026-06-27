// Sentry server-runtime init (platform-foundation PF1.1, ADR-0072).
// Loaded by instrumentation.ts when NEXT_RUNTIME === "nodejs".
//
// PII discipline (ADR-0014): sendDefaultPii is false — Sentry must NOT capture
// raw IP addresses, cookies, or request bodies. We only want stack traces +
// error context. The SDK no-ops when the DSN env var is absent (local builds).
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  // Errors only — no session replay / profiling (bundle + quota discipline).
});
