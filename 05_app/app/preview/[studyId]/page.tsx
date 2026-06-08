import { BlockView } from "@/components/feature/take/block-view";
import { Card, PreviewRibbon } from "@/components/feature/take/parts";
import { loadPreviewByToken } from "@/server/runtime/preview";

/**
 * Public preview link (V1.12 I) — `/preview/<studyId>?token=…`. No account
 * needed: a valid, unexpired, unrevoked token authorizes a read-only view of the
 * study in preview mode (nothing recorded). Outside the (app)/(take) groups, so
 * it carries only global styles — no researcher chrome, no participant runtime
 * session. An invalid/expired/revoked token shows a single neutral message.
 */
export default async function PublicPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ studyId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { studyId } = await params;
  const token = (await searchParams).token ?? "";
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

  return (
    <main className="min-h-screen bg-[var(--color-surface-page)] p-6">
      <div className="mx-auto w-full max-w-[640px]">
        <PreviewRibbon />
        <h1 className="mt-4 font-serif text-[length:var(--text-display)] font-medium text-[var(--color-ink-deep)]">
          {payload.title}
        </h1>
        <p className="mb-4 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Shared preview — exactly what a participant sees. Nothing you enter is recorded.
        </p>
        {payload.blocks.length === 0 ? (
          <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-6 text-center text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
            This study has no blocks yet.
          </p>
        ) : (
          <ol className="flex flex-col gap-4">
            {payload.blocks.map((b) => (
              <li key={b.instanceId}>
                <Card>
                  <BlockView block={b} seed={studyId} />
                </Card>
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}
