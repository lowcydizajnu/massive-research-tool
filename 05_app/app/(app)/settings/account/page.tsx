import Link from "next/link";
import { redirect } from "next/navigation";

import { cn } from "@/lib/utils";
import { registry } from "@/server/adapters/registry";
import { getCurrentDbUser } from "@/server/auth/current-db-user";
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
  const osfConfigured = !!process.env.OSF_CLIENT_ID;
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

        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-4">
          <div className="min-w-0">
            <div className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
              OSF
            </div>
            <div className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              {connection.connected
                ? `Connected${connection.connectedAt ? ` · since ${formatDate(connection.connectedAt)}` : ""}`
                : "Push preregistrations to the Open Science Framework."}
            </div>
            {!osfConfigured ? (
              <div className="mt-1 text-[length:var(--text-small)] text-[var(--color-warning-text-on-subtle)]">
                OSF app not configured on this server (set OSF_CLIENT_ID / OSF_CLIENT_SECRET).
              </div>
            ) : null}
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
          ) : (
            <Link
              href="/api/registry/osf/connect"
              className={cn(
                "shrink-0 rounded-[var(--radius-md)] px-3 py-1.5 text-[length:var(--text-body-emphasis)] font-medium text-white",
                osfConfigured
                  ? "bg-[var(--color-primary)] hover:opacity-90"
                  : "pointer-events-none bg-[var(--color-primary)] opacity-50",
              )}
            >
              + Connect
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
