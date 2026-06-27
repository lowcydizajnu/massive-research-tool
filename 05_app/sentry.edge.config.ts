// Sentry edge-runtime init (platform-foundation PF1.1, ADR-0072).
// Loaded by instrumentation.ts when NEXT_RUNTIME === "edge" (middleware, edge
// routes). Same PII discipline as the server config (ADR-0014).
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});
