import type { Route } from "next";
import Link from "next/link";

/**
 * Slim global footer for the authenticated app (bottom of every page). Holds the
 * legal + product links that previously sat buried in Settings → Account (owner
 * 2026-07-02: "put the legal thing in a page footer"). `mt-auto` pins it to the
 * bottom of the (app) shell's flex column, so it sits at the bottom of the screen
 * on short pages and below the content on long ones.
 */
const LINKS: { href: Route; label: string }[] = [
  { href: "/legal/terms" as Route, label: "Terms" },
  { href: "/legal/privacy" as Route, label: "Privacy" },
  { href: "/legal/cookies" as Route, label: "Cookies" },
  { href: "/legal/my-acceptances" as Route, label: "Your acceptances" },
  { href: "/studies?tour=replay" as Route, label: "Replay the tour" },
];

export function AppFooter() {
  return (
    <footer className="mt-auto border-t border-[var(--color-border-subtle)] px-6 py-4">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-1.5 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        <span className="font-medium text-[var(--color-text-secondary)]">My Research Lab</span>
        {LINKS.map((l) => (
          <Link key={l.label} href={l.href} className="hover:text-[var(--color-text-secondary)] hover:underline">
            {l.label}
          </Link>
        ))}
      </div>
    </footer>
  );
}
