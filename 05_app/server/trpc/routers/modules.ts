import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db/client";
import { getModuleDef } from "@/server/modules/registry";
import { experiment, experimentVersion, moduleTable, moduleVersion } from "@/server/db/schema";
import { router, workspaceProcedure } from "@/server/trpc/trpc";

export type CatalogueModule = {
  source: string;
  key: string;
  version: string;
  name: string;
  description: string;
  categoryTags: string[];
  /** Whether the block records a participant answer (vs stimulus-only) —
   *  enriched from the in-code registry; the catalogue rows don't store it. */
  collectsResponse: boolean;
  /** The block's default config — feeds the library's participant preview. */
  defaultConfig: Record<string, unknown>;
};

/** One version of a module — the Library inspect's Versions tab (ADR-0045 enrichment). */
export type ModuleVersionInfo = {
  version: string;
  name: string;
  changelog: string;
  isBreaking: boolean;
  deprecated: boolean;
};

/** A study in this workspace that uses a module — the Library inspect's Used-in tab. */
export type ModuleUsage = { studyId: string; title: string };

export const modulesRouter = router({
  /** The module catalogue the Builder's picker lists (non-deprecated versions). */
  list: workspaceProcedure.query(async (): Promise<CatalogueModule[]> => {
    const rows = await db
      .select({ m: moduleTable, v: moduleVersion })
      .from(moduleVersion)
      .innerJoin(moduleTable, eq(moduleVersion.moduleId, moduleTable.id))
      .where(isNull(moduleVersion.deprecatedAt));

    return rows.map(({ m, v }) => ({
      source: m.source,
      key: m.key,
      version: v.version,
      name: v.name,
      description: m.description,
      categoryTags: (m.categoryTags as string[]) ?? [],
      collectsResponse: getModuleDef(m.source, m.key, v.version)?.collectsResponse ?? false,
      defaultConfig: getModuleDef(m.source, m.key, v.version)?.defaultConfig ?? {},
    }));
  }),

  /** Every version of a module (incl. deprecated) — the Library inspect Versions tab. */
  versions: workspaceProcedure
    .input(z.object({ source: z.string().min(1), key: z.string().min(1) }))
    .query(async ({ input }): Promise<ModuleVersionInfo[]> => {
      const rows = await db
        .select({
          version: moduleVersion.version,
          name: moduleVersion.name,
          changelog: moduleVersion.changelog,
          isBreaking: moduleVersion.isBreaking,
          deprecatedAt: moduleVersion.deprecatedAt,
        })
        .from(moduleVersion)
        .innerJoin(moduleTable, eq(moduleVersion.moduleId, moduleTable.id))
        .where(and(eq(moduleTable.source, input.source), eq(moduleTable.key, input.key)));
      return rows
        .map((r) => ({
          version: r.version,
          name: r.name,
          changelog: r.changelog,
          isBreaking: r.isBreaking,
          deprecated: r.deprecatedAt != null,
        }))
        .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
    }),

  /**
   * Studies in this workspace that use a module — the Library inspect Used-in tab.
   * Scans each experiment's version snapshots for a block matching source+key via
   * jsonb containment; returns the distinct studies (workspace-scoped).
   */
  usedIn: workspaceProcedure
    .input(z.object({ source: z.string().min(1), key: z.string().min(1) }))
    .query(async ({ ctx, input }): Promise<ModuleUsage[]> => {
      const needle = JSON.stringify([{ source: input.source, key: input.key }]);
      const rows = await db
        .selectDistinct({ studyId: experiment.id, title: experiment.title })
        .from(experimentVersion)
        .innerJoin(experiment, eq(experimentVersion.experimentId, experiment.id))
        .where(
          and(
            eq(experiment.tenantId, ctx.workspace.id),
            isNull(experiment.archivedAt),
            sql`${experimentVersion.definitionSnapshot}->'blocks' @> ${needle}::jsonb`,
          ),
        );
      return rows;
    }),
});
