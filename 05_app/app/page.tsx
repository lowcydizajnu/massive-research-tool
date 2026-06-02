import { ThemeToggle } from "@/components/theme-toggle";
import { auth } from "@/server/adapters/auth";

/**
 * /  — verification page for the Phase 5 scaffold landing.
 *
 * Renders the design language so we can confirm at a glance that
 * brief v0.6 and tokens.css are wired correctly:
 *   - Warm parchment page background.
 *   - Plex Serif display headline.
 *   - Floating cards on the page (the modular surface pattern).
 *   - Theme toggle persisting + flipping the whole surface.
 *   - Vibrant functional palette swatches.
 *
 * When signed in, shows a minimal authenticated welcome (the assertable
 * post-onboarding landing for the signup-slice e2e). This whole page goes away
 * once /studies becomes the default landing.
 */

export default async function HomePage() {
  // Server-side read via the adapter — no Clerk import in feature code.
  const user = await auth.getCurrentUser();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-12">
      {user ? (
        <section
          data-testid="welcome"
          className="flex flex-col gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6"
        >
          <p className="font-mono text-[length:var(--text-mono)] uppercase tracking-wider text-[var(--color-text-muted)]">
            Signed in
          </p>
          <p className="font-serif text-[length:var(--text-heading-1)] font-medium text-[var(--color-text-primary)]">
            Welcome, {user.displayName || user.email}.
          </p>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Studies destination lands here next (a later ADR-0011 move).
          </p>
        </section>
      ) : null}

      <header className="flex flex-col gap-2">
        <p className="font-mono text-[length:var(--text-mono)] uppercase tracking-wider text-[var(--color-text-muted)]">
          Phase 5 · scaffold landing
        </p>
        <h1 className="font-serif text-[length:var(--text-display)] font-medium leading-tight text-[var(--color-ink-deep)]">
          Build studies.<br />Document everything.
        </h1>
        <p className="max-w-prose text-[var(--color-text-secondary)]">
          This page exists to verify that brief v0.6 and{" "}
          <code className="font-mono text-[length:var(--text-mono)]">
            styles/tokens.css
          </code>{" "}
          are wired correctly. It disappears once the Studies destination
          becomes the default landing.
        </p>
      </header>

      <Card>
        <h2 className="font-serif text-[length:var(--text-heading-1)] font-medium text-[var(--color-text-primary)]">
          Theme preference
        </h2>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Picked here persists to localStorage. Clerk sync wires in the next
          iteration per ADR-0011.
        </p>
        <div className="pt-3">
          <ThemeToggle />
        </div>
      </Card>

      <Card>
        <h2 className="font-serif text-[length:var(--text-heading-1)] font-medium text-[var(--color-text-primary)]">
          Palette — both modes
        </h2>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Polarized two-stop ramps. Hover/active never introduces a third hue.
        </p>
        <div className="grid grid-cols-2 gap-3 pt-3 sm:grid-cols-4">
          <Swatch name="primary" tokenSubtle="primary-subtle" tokenFull="primary" />
          <Swatch name="accent" tokenSubtle="accent-subtle" tokenFull="accent" />
          <Swatch name="success" tokenSubtle="success-subtle" tokenFull="success" />
          <Swatch name="danger" tokenSubtle="danger-subtle" tokenFull="danger" />
        </div>
      </Card>

      <Card>
        <h2 className="font-serif text-[length:var(--text-heading-1)] font-medium text-[var(--color-text-primary)]">
          Demo block — validation states
        </h2>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Same surface treatment as the Builder mode wireframe.
        </p>
        <div className="space-y-3 pt-3">
          <BlockRow
            title="Block 1 · Stimulus presentation"
            identifier="core/social-post@1.2.0"
            status="valid"
          />
          <BlockRow
            title="Block 2 · Manipulation check"
            identifier="core/likert-7@1.0.0"
            status="error"
          />
          <button
            type="button"
            className="w-full rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-[length:var(--text-body)] font-medium text-white transition-opacity hover:opacity-90 active:opacity-80"
          >
            Save as named version
          </button>
        </div>
      </Card>
    </main>
  );
}

/* ============================================================
   Small composition primitives — not shadcn yet; just enough to
   verify the surface treatment works. Real components arrive when
   we shadcn-init in the next iteration.
   ============================================================ */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6"
      style={{ boxShadow: "var(--shadow-none, none)" }}
    >
      {children}
    </section>
  );
}

function Swatch({
  name,
  tokenSubtle,
  tokenFull,
}: {
  name: string;
  tokenSubtle: string;
  tokenFull: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-mono text-[length:var(--text-mono)] text-[var(--color-text-muted)]">
        {name}
      </p>
      <div className="flex h-8 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)]">
        <div
          className="flex-1"
          style={{ backgroundColor: `var(--color-${tokenSubtle})` }}
        />
        <div
          className="flex-1"
          style={{ backgroundColor: `var(--color-${tokenFull})` }}
        />
      </div>
    </div>
  );
}

function BlockRow({
  title,
  identifier,
  status,
}: {
  title: string;
  identifier: string;
  status: "valid" | "error";
}) {
  const isValid = status === "valid";
  return (
    <div className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3">
      <div>
        <p className="text-[length:var(--text-body)] font-medium text-[var(--color-text-primary)]">
          {title}
        </p>
        <p className="font-mono text-[length:var(--text-mono)] text-[var(--color-text-muted)]">
          {identifier}
        </p>
      </div>
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--text-mono)] font-medium"
        style={{
          backgroundColor: isValid
            ? "var(--color-success-subtle)"
            : "var(--color-danger-subtle)",
          color: isValid
            ? "var(--color-success-text-on-subtle)"
            : "var(--color-danger-text-on-subtle)",
        }}
      >
        <span
          className="size-1.5 rounded-full"
          style={{
            backgroundColor: isValid
              ? "var(--color-success)"
              : "var(--color-danger)",
          }}
        />
        {isValid ? "schema valid" : "missing field"}
      </span>
    </div>
  );
}
