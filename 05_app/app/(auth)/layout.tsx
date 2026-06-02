import Link from "next/link";

/**
 * Auth surface layout — the ONLY place the canonical three-zone surface does
 * not apply (per 03_design/wireframes/signup-onboarding.md). A centered narrow
 * column on warm parchment: brand mark top-left, content card, footer links.
 *
 * The user has no workspace yet, so workspace-global chrome would be empty —
 * the brand-coded centered column is the researcher-recognized SaaS pattern.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-surface-page)] px-6 py-6">
      <header>
        <Link
          href="/"
          aria-label="Massive Research Tool home"
          className="inline-flex items-center gap-2"
        >
          <span className="size-2 rounded-full bg-[var(--color-primary)]" />
          <span className="font-serif text-[length:var(--text-heading-2)] font-medium text-[var(--color-ink-deep)]">
            Massive Research Tool
          </span>
        </Link>
      </header>

      <main
        role="main"
        className="flex flex-1 items-center justify-center py-8"
      >
        <div className="w-full max-w-[480px]">{children}</div>
      </main>

      {/* Plain anchors: these destinations don't exist yet, so they're out of
          the typed-routes graph. Swap to <Link> when the pages land. */}
      <footer className="flex justify-center gap-4 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        <a href="/privacy" className="hover:text-[var(--color-text-secondary)]">
          Privacy
        </a>
        <a href="/terms" className="hover:text-[var(--color-text-secondary)]">
          Terms
        </a>
        <a href="/help" className="hover:text-[var(--color-text-secondary)]">
          Help
        </a>
      </footer>
    </div>
  );
}
