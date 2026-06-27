import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Moved out of `experimental` in Next 15.5.
  typedRoutes: true,
  // Pin the workspace root to this app dir. Without it Next infers the root
  // from a stray ~/package-lock.json and warns on every dev/build.
  outputFileTracingRoot: import.meta.dirname,
  turbopack: { root: import.meta.dirname },
  // @react-pdf/renderer (ADR-0027) must not be bundled — it's a Node-side PDF
  // renderer used only in the export-pdf route handler.
  serverExternalPackages: ["@react-pdf/renderer"],
};

// Sentry (platform-foundation PF1.1, ADR-0072 — deliberate ADR-0007 exception:
// the SDK auto-instruments via its build plugin, so it is NOT behind an adapter).
// Source-map upload only runs when SENTRY_AUTH_TOKEN + org/project are present;
// without them the plugin no-ops, so local + token-less builds are unaffected.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  disableLogger: true,
  widenClientFileUpload: true,
});
