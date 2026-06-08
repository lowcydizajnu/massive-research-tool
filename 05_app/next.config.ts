import type { NextConfig } from "next";

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

export default nextConfig;
