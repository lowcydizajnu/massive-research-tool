import type { Metadata } from "next";
import {
  IBM_Plex_Sans,
  IBM_Plex_Serif,
  IBM_Plex_Mono,
} from "next/font/google";
// Deliberate lock-in exception (ADR-0007, recorded in lock-in-inventory.md):
// ClerkProvider is a React context provider and must wrap the app at the root,
// so it can't sit behind the server-only AuthAdapter. Removed on auth migration.
import { ClerkProvider } from "@clerk/nextjs";

import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const plexSerif = IBM_Plex_Serif({
  variable: "--font-plex-serif",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Massive Research Tool",
  description: "Build studies. Document everything.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body
          className={`${plexSans.variable} ${plexSerif.variable} ${plexMono.variable}`}
        >
          <ThemeProvider>{children}</ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
