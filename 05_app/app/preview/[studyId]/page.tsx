import type { Route } from "next";
import Link from "next/link";

import { BlockView } from "@/components/feature/take/block-view";
import { Card, PreviewRibbon } from "@/components/feature/take/parts";
import { cn } from "@/lib/utils";
import { loadPreviewByToken } from "@/server/runtime/preview";

/**
 * Public preview link (V1.12 I) — `/preview/<studyId>?token=…`. No account
 * needed: a valid token authorizes a read-only view (nothing recorded). A mode
 * toggle (ADR-0065) switches between the real **participant flow** (one screen at
 * a time, the default) and **all screens** stacked. Server-rendered via search
 * params so it works without client JS and BlockView stays a server component.
 */
export default async function PublicPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ studyId: string }>;
  searchParams: Promise<{ token?: string; mode?: string; screen?: string }>;
}) {
  const { studyId } = await params;
  const sp = await searchParams;
  const token = sp.token ?? "";
  const payload = await loadPreviewByToken(studyId, token);

  if (!payload) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-surface-page)] p-6">
        <div className="max-w-[420px] rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6 text-center">
          <h1 className="font-serif text-[length:var(--text-title)] text-[var(--color-text-primary)]">
            This preview link isn’t valid
          </h1>
          <p className="mt-2 text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
            It may have expired or been revoked. Ask the researcher for a fresh link.
          </p>
        </div>
      </main>
    );
  }

  const stacked = sp.mode === "stacked";
  const screens = payload.screens;
  const total = screens.length;
  const idx = Math.max(0, Math.min(Math.max(0, total - 1), Number(sp.screen) || 0));
  const href = (q: Record<string, string>) =>
    `/preview/${studyId}?${new URLSearchParams({ token, ...q }).toString()}` as Route;

  const tab = (label: string, active: boolean, to: Route) => (
    <Link
      href={to}
      className={cn(
        "rounded-[var(--radius-md)] px-2.5 py-1 text-[length:var(--text-small)] font-medium",
        active
          ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
      )}
    >
      {label}
    </Link>
  );

  return (
    <main className="min-h-screen bg-[var(--color-surface-page)] p-6">
      <div className="mx-auto w-full max-w-[640px]">
        <PreviewRibbon />
        <h1 className="mt-4 font-serif text-[length:var(--text-display)] font-medium text-[var(--color-ink-deep)]">
          {payload.title}
        </h1>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            {stacked
              ? "All screens, stacked for review. Nothing you enter is recorded."
              : "Participant flow — one screen at a time. Nothing you enter is recorded."}
          </p>
          <div role="radiogroup" aria-label="Preview mode" className="flex gap-1">
            {tab("Participant flow", !stacked, href({ mode: "flow", screen: "0" }))}
            {tab("All screens", stacked, href({ mode: "stacked" }))}
          </div>
        </div>

        {payload.blocks.length === 0 ? (
          <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-6 text-center text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
            This study has no blocks yet.
          </p>
        ) : stacked ? (
          <ol className="flex flex-col gap-4">
            {payload.blocks.map((b) => (
              <li key={b.instanceId}>
                <Card>
                  <BlockView block={b} seed={studyId} chat={payload.chat} />
                </Card>
              </li>
            ))}
          </ol>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Screen {idx + 1} of {total}</p>
            <Card>
              <div className="flex flex-col gap-[var(--take-block-gap,1.5rem)]">
                {screens[idx].map((b) => {
                  const prefix = screens[idx].length > 1 ? `${b.instanceId}__` : "";
                  return <BlockView key={b.instanceId} block={b} seed={studyId} namePrefix={prefix} chat={payload.chat} />;
                })}
              </div>
            </Card>
            <div className="flex items-center justify-between">
              {idx > 0 ? (
                <Link
                  href={href({ mode: "flow", screen: String(idx - 1) })}
                  className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
                >
                  ← Back
                </Link>
              ) : (
                <span />
              )}
              {idx < total - 1 ? (
                <Link
                  href={href({ mode: "flow", screen: String(idx + 1) })}
                  className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-1.5 text-[length:var(--text-small)] font-medium text-white hover:opacity-90"
                >
                  Continue →
                </Link>
              ) : (
                <Link
                  href={href({ mode: "flow", screen: "0" })}
                  className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
                >
                  Start over
                </Link>
              )}
            </div>
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              Screens that only appear based on answers aren’t shown in preview (no responses are recorded).
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
