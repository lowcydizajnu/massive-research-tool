import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";

import { FeatureTip } from "@/components/feature/onboarding/feature-tip";
import { ProfileForm } from "@/components/feature/settings/profile-form";
import { PublicProfileSection } from "@/components/feature/settings/public-profile-section";
import { PanelSideToggle } from "@/components/feature/settings/panel-side-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { cn } from "@/lib/utils";
import { registry } from "@/server/adapters/registry";
import { isOsfConfigured } from "@/server/adapters/registry.osf";
import { getCurrentDbUser } from "@/server/auth/current-db-user";
import { connectOsfTokenAction } from "@/server/registry/connect-token";
import { disconnectOsfAction } from "@/server/registry/disconnect";

/**
 * Account Settings (account-settings.md) — PERSONAL scope (IA v0.7): renders in
 * personal-mode chrome, holding only per-user concerns — Profile, Connections
 * (per-user OSF OAuth, ADR-0005), and Appearance (theme + panel side). Anything
 * that mutates a workspace (demo content, the workspace Activity-feed filter)
 * lives on `/settings/workspace` instead, so Account never "leads to a
 * workspace". Notifications stays shown-but-inert (a later surface).
 */
const TABS = ["Profile", "Connections", "Appearance", "Notifications"] as const;
const ACTIVE_TABS = new Set(["Profile", "Connections", "Appearance"]);
const tabKey = (t: string) => t.toLowerCase();

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ osf?: string; tab?: string }>;
}) {
  const dbUser = await getCurrentDbUser();
  if (!dbUser) redirect("/signin");

  const connection = await registry.getConnection(dbUser.id);
  const osfConfigured = isOsfConfigured();
  const sp = await searchParams;
  const flag = sp.osf;
  const tab =
    sp.tab === "connections" ? "connections" : sp.tab === "appearance" ? "appearance" : "profile";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
          Account
        </h1>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Your personal settings. Workspace settings (demo content, the team Activity feed) live in{" "}
          <Link href="/settings/workspace" className="text-[var(--color-primary)] hover:opacity-90">
            Workspace settings
          </Link>
          . See your{" "}
          <Link href={"/legal/my-acceptances" as Route} className="text-[var(--color-primary)] hover:opacity-90">
            legal acceptances
          </Link>{" "}
          or{" "}
          <Link href={"/studies?tour=replay" as Route} className="text-[var(--color-primary)] hover:opacity-90">
            replay the product tour
          </Link>
          .
        </p>
      </div>

      <nav role="tablist" aria-label="Account settings" className="flex flex-wrap gap-1 border-b border-[var(--color-border-subtle)] pb-2">
        {TABS.map((label) => {
          const selectable = ACTIVE_TABS.has(label);
          const current = selectable && tabKey(label) === tab;
          const tabCls = cn(
            "rounded-[var(--radius-md)] px-2.5 py-1 text-[length:var(--text-small)] font-medium",
            current
              ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
              : selectable
                ? "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
                : "cursor-default text-[var(--color-text-muted)] opacity-60",
          );
          return selectable ? (
            <Link
              key={label}
              role="tab"
              aria-current={current ? "page" : undefined}
              href={`/settings/account?tab=${tabKey(label)}`}
              className={tabCls}
            >
              {label}
            </Link>
          ) : (
            <span key={label} role="tab" aria-disabled title="Coming soon" className={tabCls}>
              {label}
            </span>
          );
        })}
      </nav>

      {tab === "profile" ? (
        <>
          <ProfileForm />
          <PublicProfileSection />
        </>
      ) : null}

      {tab === "appearance" ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">
            Appearance
          </h2>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Choose how Massive Research Lab looks. “System” follows your device setting.
          </p>
          <ThemeToggle />
          <div className="mt-2 border-t border-[var(--color-border-subtle)] pt-4">
            <PanelSideToggle />
          </div>
        </section>
      ) : null}

      {tab === "connections" ? (
        <>
      {flag === "connected" ? (
        <p role="status" className="rounded-[var(--radius-md)] bg-[var(--color-success-subtle)] px-3 py-2 text-[length:var(--text-small)] text-[var(--color-success-text-on-subtle)]">
          OSF connected.
        </p>
      ) : flag === "error" ? (
        <p role="alert" className="rounded-[var(--radius-md)] bg-[var(--color-danger-subtle)] px-3 py-2 text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
          Couldn’t connect to OSF. Try again.
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">
          Connections
        </h2>

        {!connection.connected ? <FeatureTip id="connect-osf" /> : null}

        <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
                OSF
              </div>
              <div className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                {connection.connected
                  ? `Connected${connection.connectedAt ? ` · since ${formatDate(connection.connectedAt)}` : ""}`
                  : "Push preregistrations to the Open Science Framework."}
              </div>
            </div>

            {connection.connected ? (
              <form action={disconnectOsfAction}>
                <FormSubmitButton
                  variant="secondary"
                  idleLabel="Disconnect"
                  pendingLabel="Disconnecting…"
                  className="shrink-0 px-3 py-1.5"
                />
              </form>
            ) : null}
          </div>

          {!connection.connected ? (
            <div className="flex flex-col gap-3 border-t border-[var(--color-border-subtle)] pt-3">
              <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                Connect once with <strong className="font-medium text-[var(--color-text-secondary)]">either</strong> method below — you only need one.
                {osfConfigured
                  ? " Pasting a Personal Access Token works immediately; signing in with OSF (below) is a convenience if your OSF account allows it."
                  : " Paste a Personal Access Token — it's the quickest way and needs no extra setup."}
              </p>
              <form action={connectOsfTokenAction} className="flex flex-col gap-2">
                <label
                  htmlFor="osf-token"
                  className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]"
                >
                  Personal Access Token
                </label>
                <div className="flex gap-2">
                  <input
                    id="osf-token"
                    name="token"
                    type="password"
                    required
                    autoComplete="off"
                    placeholder="Paste your OSF token"
                    className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-1.5 text-[length:var(--text-body)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
                  />
                  <FormSubmitButton
                    idleLabel="Connect"
                    pendingLabel="Connecting…"
                    className="shrink-0 px-3 py-1.5"
                  />
                </div>
                <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                  Generate one at{" "}
                  <a
                    href="https://osf.io/settings/tokens"
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-[var(--color-text-secondary)]"
                  >
                    osf.io/settings/tokens
                  </a>{" "}
                  with the{" "}
                  <code className="font-mono text-[var(--color-text-secondary)]">osf.full_write</code>{" "}
                  scope. Stored encrypted; never shown again.
                </p>
              </form>

              {osfConfigured ? (
                <Link
                  href="/api/auth/osf/connect"
                  className="text-[length:var(--text-small)] text-[var(--color-text-secondary)] underline hover:opacity-80"
                >
                  Or connect with OSF login (OAuth)
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
        </>
      ) : null}
    </main>
  );
}
