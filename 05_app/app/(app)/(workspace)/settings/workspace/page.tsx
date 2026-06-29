import { ActivityFilterSettings } from "@/components/feature/settings/activity-filter-settings";
import { AiProviderSettings } from "@/components/feature/settings/ai-provider-settings";
import { DemoContentToggle } from "@/components/feature/settings/demo-content-toggle";
import { SupportAccessToggle } from "@/components/feature/settings/support-access-toggle";
import { getCurrentDbUser } from "@/server/auth/current-db-user";
import { isAdminUser } from "@/server/admin/is-admin";
import { getServerApi } from "@/server/trpc/server";

/**
 * Workspace Settings — `/settings/workspace` (WORKSPACE scope, IA v0.7). The
 * counterpart to personal Account settings: everything here mutates the *active
 * workspace*, not the signed-in user. Holds the workspace-admin toggles split
 * out of Account — "Show demo content" (ADR-0023) and the workspace Activity-feed
 * filter (ADR-0046). Owner/admin write-gating lives inside each control (they
 * read the active workspace + viewer role via tRPC). Renders in workspace chrome
 * so the left rail + workspace top bar make the scope obvious.
 */
export const dynamic = "force-dynamic";

export default async function WorkspaceSettingsPage() {
  const api = await getServerApi();
  const active = await api.workspace.active();
  // "Show demo content" (ADR-0023) is an operator tool, not a researcher
  // setting — restrict it to the admin allow-list (PF4 owner request).
  const dbUser = await getCurrentDbUser();
  const isAdmin = isAdminUser(dbUser);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
          Workspace settings
        </h1>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Settings for <span className="font-medium text-[var(--color-text-secondary)]">{active.name}</span>. These
          affect everyone in this workspace.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        {isAdmin ? <DemoContentToggle /> : null}
        <div className={isAdmin ? "mt-2 border-t border-[var(--color-border-subtle)] pt-4" : ""}>
          <ActivityFilterSettings />
        </div>
        <div className="mt-2 border-t border-[var(--color-border-subtle)] pt-4">
          <h3 className="mb-2 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
            Privacy
          </h3>
          <SupportAccessToggle />
        </div>
        <div className="mt-2 border-t border-[var(--color-border-subtle)] pt-4">
          <h3 className="mb-2 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
            AI provider
          </h3>
          <AiProviderSettings />
        </div>
      </section>
    </main>
  );
}
