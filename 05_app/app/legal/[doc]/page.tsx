import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";

import { CURRENT_LEGAL_VERSION, LEGAL_TITLES, getLegalDoc, isLegalKind } from "@/lib/legal/content";

/**
 * Public legal pages (legal-baseline LG1): /legal/terms · /legal/privacy ·
 * /legal/cookies, with ?v=N to retrieve a superseded version (audit-friendly).
 * Content is owner-authored repo content (trusted) → rendered with marked;
 * no user input reaches this renderer, so no client-side sanitize needed.
 */
type Params = { doc: string };
type Search = { v?: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { doc } = await params;
  if (!isLegalKind(doc)) return { title: "Legal — My Research Lab" };
  return { title: `${LEGAL_TITLES[doc]} — My Research Lab` };
}

export default async function LegalPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { doc } = await params;
  const { v } = await searchParams;
  if (!isLegalKind(doc)) notFound();

  const requested = v && /^\d+$/.test(v) ? Number(v) : undefined;
  const legal = getLegalDoc(doc, requested);
  if (!legal) notFound();

  const isCurrent = legal.version === CURRENT_LEGAL_VERSION[doc];
  const html = marked.parse(legal.body, { async: false, gfm: true }) as string;
  const updated = new Date(legal.effectiveDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1 border-b border-[var(--color-border-subtle)] pb-4">
        <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">{LEGAL_TITLES[doc]}</h1>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Last updated {updated} · Version {legal.version}
          {isCurrent ? "" : " · superseded — not the version currently in force"}
        </p>
      </header>

      {/* Trusted, owner-authored content. */}
      <article
        className="flex flex-col gap-3 text-[length:var(--text-body)] leading-relaxed text-[var(--color-text-secondary)] [&_a]:text-[var(--color-primary)] [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--color-border-subtle)] [&_blockquote]:pl-3 [&_blockquote]:text-[var(--color-text-muted)] [&_code]:font-mono [&_h2]:mt-4 [&_h2]:font-serif [&_h2]:text-[length:var(--text-title)] [&_h2]:font-medium [&_h2]:text-[var(--color-text-primary)] [&_h3]:mt-3 [&_h3]:font-medium [&_h3]:text-[var(--color-text-primary)] [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-[var(--color-text-primary)] [&_table]:w-full [&_td]:border [&_td]:border-[var(--color-border-subtle)] [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-[var(--color-border-subtle)] [&_th]:px-2 [&_th]:py-1 [&_th]:text-left"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <footer className="border-t border-[var(--color-border-subtle)] pt-4 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        <Link className="text-[var(--color-primary)] hover:underline" href={"/legal/terms" as Route}>Terms</Link> ·{" "}
        <Link className="text-[var(--color-primary)] hover:underline" href={"/legal/privacy" as Route}>Privacy</Link> ·{" "}
        <Link className="text-[var(--color-primary)] hover:underline" href={"/legal/cookies" as Route}>Cookies</Link>
      </footer>
    </main>
  );
}
