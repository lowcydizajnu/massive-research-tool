import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { UseTemplateButton } from "@/components/feature/library/use-template-button";
import { BlockView } from "@/components/feature/take/block-view";
import { getServerApi } from "@/server/trpc/server";

/**
 * Template detail (library-template-detail.md, ADR-0063). Read-only preview of a
 * template's frozen blocks + metadata, with a "Use template" CTA. Visibility is
 * enforced server-side by templates.get (own / starter / public only).
 */
export const dynamic = "force-dynamic";

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const api = await getServerApi();

  let t: Awaited<ReturnType<typeof api.templates.get>>;
  try {
    t = await api.templates.get({ templateId: id });
  } catch {
    notFound();
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
      <Link
        href={"/library?tab=templates" as Route}
        className="w-fit text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:underline"
      >
        ← Templates
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
            {t.name}
          </h1>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            {t.starter ? "Starter template · " : ""}
            {t.createdByName ? `By ${t.createdByName} · ` : ""}Used {t.useCount}×
          </p>
          {t.description ? (
            <p className="max-w-prose text-[length:var(--text-body)] text-[var(--color-text-secondary)]">{t.description}</p>
          ) : null}
          {t.tags.length > 0 ? (
            <ul className="mt-1 flex flex-wrap gap-1">
              {t.tags.map((tag) => (
                <li key={tag} className="rounded-full bg-[var(--color-surface-subtle)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                  #{tag}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <UseTemplateButton templateId={t.id} />
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
          Preview ({t.blocks.length} block{t.blocks.length === 1 ? "" : "s"})
        </h2>
        {t.blocks.length === 0 ? (
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">This template has no blocks.</p>
        ) : (
          <div aria-hidden className="pointer-events-none flex select-none flex-col gap-3">
            {t.blocks.map((b) => (
              <div
                key={b.instanceId}
                className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-page)] p-3"
              >
                <BlockView block={b as never} namePrefix={`tpv_${b.instanceId}__`} seed={`template-${t.id}`} />
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
