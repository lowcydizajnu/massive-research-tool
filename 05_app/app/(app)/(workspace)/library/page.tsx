import type { Route } from "next";
import Link from "next/link";

import { MaterialsLibrary } from "@/components/feature/library/materials-library";
import { ModuleLibrary } from "@/components/feature/library/module-library";
import { TemplateLibrary } from "@/components/feature/library/template-library";
import { cn } from "@/lib/utils";
import { getServerApi } from "@/server/trpc/server";

/**
 * Library destination — `/library` (library-browse.md, V1.13.0 Stream D). A
 * read surface for reusable assets, with a sub-nav over five sections. Only
 * **Modules** has data today; the rest are blocked on unbuilt prerequisites
 * (Materials → R2 upload; Themes → per-study theming; Templates → a version-kind
 * extension; Imports → the V2.0 sandbox) and show a "coming soon" placeholder.
 * URL-driven tab (`?tab=`); workspace-scoped (modules.list is workspaceProcedure).
 */
export const dynamic = "force-dynamic";

const TABS = [
  { key: "modules", label: "Modules" },
  { key: "themes", label: "Themes" },
  { key: "materials", label: "Materials" },
  { key: "templates", label: "Templates" },
  { key: "imports", label: "Imports" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const COMING_SOON: Record<Exclude<TabKey, "modules" | "templates" | "materials">, string> = {
  themes: "Saved visual themes will live here once per-study theming ships.",
  imports: "Studies imported from other tools will live here once the import sandbox ships.",
};

function parseTab(value: string | string[] | undefined): TabKey {
  const v = Array.isArray(value) ? value[0] : value;
  return TABS.some((t) => t.key === v) ? (v as TabKey) : "modules";
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const tab = parseTab((await searchParams).tab);
  const api = await getServerApi();
  const modules = tab === "modules" ? await api.modules.list() : [];

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5">
      <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
        Library
      </h1>

      <div className="flex flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
      <nav
        role="tablist"
        aria-label="Library sections"
        className="flex flex-wrap gap-1 border-b border-[var(--color-border-subtle)] pb-2"
      >
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              role="tab"
              aria-selected={active}
              href={(t.key === "modules" ? "/library" : `/library?tab=${t.key}`) as Route}
              className={cn(
                "rounded-[var(--radius-md)] px-2.5 py-1 text-[length:var(--text-small)] font-medium",
                active
                  ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {tab === "modules" ? (
        <ModuleLibrary modules={modules} />
      ) : tab === "templates" ? (
        <TemplateLibrary />
      ) : tab === "materials" ? (
        <MaterialsLibrary />
      ) : (
        <div className="flex flex-col items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-8">
          <p className="font-serif text-[length:var(--text-heading-1)] font-medium text-[var(--color-text-primary)]">
            {TABS.find((t) => t.key === tab)!.label} — coming soon
          </p>
          <p className="max-w-prose text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
            {COMING_SOON[tab as Exclude<TabKey, "modules" | "templates" | "materials">]}
          </p>
        </div>
      )}
      </div>
    </main>
  );
}
