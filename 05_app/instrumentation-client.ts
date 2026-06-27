// Sentry client-runtime init (platform-foundation PF1.1, ADR-0072).
// Next.js loads this on the client (replaces sentry.client.config.ts in
// @sentry/nextjs v9). PII discipline per ADR-0014: sendDefaultPii false.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});

// Instrument App Router client navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
