import type { Metadata } from "next";
// Deliberate lock-in exception (ADR-0007, recorded in lock-in-inventory.md):
// ClerkProvider is a React context provider and must wrap the app at the root,
// so it can't sit behind the server-only AuthAdapter. Removed on auth migration.
import { ClerkProvider } from "@clerk/nextjs";

// Self-hosted IBM Plex via @fontsource (per design-system/tokens.md — no CDN
// dependency). next/font/google was the prior approach but it fetches from
// Google at build time, which fails in CDN-less environments and dropped the
// whole UI to the Times fallback. @fontsource bundles the fonts as npm assets.
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-serif/400.css";
import "@fontsource/ibm-plex-serif/500.css";
import "@fontsource/ibm-plex-serif/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";

import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Massive Research Tool",
  description: "Build studies. Document everything.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider signInUrl="/signin" signUpUrl="/signup">
      <html lang="en" suppressHydrationWarning>
        <body>
          <ThemeProvider>{children}</ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
