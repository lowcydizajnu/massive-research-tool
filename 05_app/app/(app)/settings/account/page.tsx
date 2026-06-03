import Link from "next/link";
import { redirect } from "next/navigation";

import { cn } from "@/lib/utils";
import { registry } from "@/server/adapters/registry";
import { isOsfConfigured } from "@/server/adapters/registry.osf";
import { getCurrentDbUser } from "@/server/auth/current-db-user";
import { connectOsfTokenAction } from "@/server/registry/connect-token";
import { disconnectOsfAction } from "@/server/registry/disconnect";

/**
 * Account Settings (account-settings.md). V1.5 ships the **Connections** tab
 * (per-user OSF OAuth, ADR-0005); Profile / Appearance / Notifications are
 * shown but inert (full account settings are a later surface).
 */
const TABS = ["Profile", "Appearance", "Connections", "Notifications"] as const;

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
  searchParams: Promise<{ osf?: string }>;
}) {
  const dbUser = await getCurrentDbUser();
  if (!dbUser) redirect("/signin");

  const connection = await registry.getConnection(dbUser.id);
  const osfConfigured = isOsfConfigured();
  const flag = (await searchParams).osf;

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
      <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
        Account
      </h1>

      <nav role="tablist" aria-label="Account settings" className="flex flex-wrap gap-1 border-b border-[var(--color-border-subtle)] pb-2">
        {TABS.map((tab) => {
          const active = tab === "Connections";
          return (
            <span
              key={tab}
              role="tab"
              aria-current={active ? "page" : undefined}
              aria-disabled={!active}
              title={active ? undefined : "Coming soon"}
              className={cn(
                "rounded-[var(--radius-md)] px-2.5 py-1 text-[length:var(--text-small)] font-medium",
                active
                  ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
                  : "cursor-default text-[var(--color-text-muted)] opacity-60",
              )}
            >
              {tab}
            </span>
          );
        })}
      </nav>

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
                <button
                  type="submit"
                  className="shrink-0 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
                >
                  Disconnect
                </button>
              </form>
            ) : null}
          </div>

          {!connection.connected ? (
            <div className="flex flex-col gap-3 border-t border-[var(--color-border-subtle)] pt-3">
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
                  <button
                    type="submit"
                    className="shrink-0 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-[length:var(--text-body-emphasis)] font-medium text-white hover:opacity-90"
                  >
                    Connect
                  </button>
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
    </main>
  );
}
