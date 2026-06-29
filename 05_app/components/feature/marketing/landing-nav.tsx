import Link from "next/link";
import type { Route } from "next";
import { ArrowRight } from "lucide-react";

/**
 * Shared top navigation for the public landing proposals: brand mark, Docs,
 * and a "Go to app" CTA (existing users → sign in). Sticky at the top of each
 * variant; styled per palette — Minimal/Bold ride the token surfaces, Scenes
 * uses its free navy/orange palette (no tokens, by design).
 */
const DOCS = "https://docs.myresearchlab.app";
const ORANGE = "#E2692E"; // Scenes accent (matches landing-page-scenes)
const NAVY = "#102444";

export function LandingNav({ variant }: { variant: "minimal" | "bold" | "scenes" }) {
  const scenes = variant === "scenes";

  const brand = scenes ? "text-white" : "text-[var(--color-text-primary)]";
  const link = scenes
    ? "text-white/80 hover:text-white"
    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]";

  return (
    <header
      className={`sticky top-0 z-40 border-b backdrop-blur ${scenes ? "border-white/10" : "border-[var(--color-border-subtle)]"}`}
      style={{ backgroundColor: scenes ? "rgba(16,36,68,0.85)" : "color-mix(in srgb, var(--color-surface-page) 85%, transparent)" }}
      data-navy={NAVY}
    >
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3">
        <Link href={"/" as Route} className={`font-serif text-[18px] font-medium ${brand}`}>
          My Research Lab
        </Link>
        <div className="flex items-center gap-5 text-[14px]">
          <a href={DOCS} className={`font-medium ${link}`}>
            Docs
          </a>
          {scenes ? (
            <Link
              href={"/signin" as Route}
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 font-medium text-white hover:opacity-90"
              style={{ backgroundColor: ORANGE }}
            >
              Go to app <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : (
            <Link
              href={"/signin" as Route}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 font-medium text-white hover:opacity-90"
            >
              Go to app <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
