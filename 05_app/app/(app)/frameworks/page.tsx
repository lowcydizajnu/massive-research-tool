import { FollowButton } from "@/components/feature/follow/follow-button";
import { getServerApi } from "@/server/trpc/server";

// Reads an authed tRPC procedure — render per-request (no static prerender at build).
export const dynamic = "force-dynamic";

/**
 * Frameworks destination (frameworks-browse.md) — the browse grid. V1.7 ships
 * the card grid + the `+ Follow` affordance (the framework follow target,
 * ADR-0015 / follow-affordances.md); the richer right-panel detail tabs
 * (Overview / Used in / Versions) + "Start a study from this" remain a noted
 * fast-follow. RSC reads via the in-process caller.
 */
export default async function FrameworksPage() {
  const api = await getServerApi();
  const frameworks = await api.frameworks.list();

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
      <div className="min-w-0">
        <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
          Frameworks
        </h1>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          Curated protocols to start a study from. Follow one to hear about new versions.
        </p>
      </div>

      {frameworks.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {frameworks.map((f) => (
            <li
              key={f.key}
              className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">
                  {f.name}
                </h2>
                <FollowButton targetType="framework" targetId={f.key} name={f.name} />
              </div>
              <p className="line-clamp-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                {f.description}
              </p>
              <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                {f.blockCount} block{f.blockCount === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-6">
          <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
            No Frameworks yet.
          </p>
        </div>
      )}
    </main>
  );
}
