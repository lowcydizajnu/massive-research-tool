import { eq, isNull } from "drizzle-orm";

import { db } from "@/server/db/client";
import { moduleTable, moduleVersion } from "@/server/db/schema";
import { router, workspaceProcedure } from "@/server/trpc/trpc";

export type CatalogueModule = {
  source: string;
  key: string;
  version: string;
  name: string;
  description: string;
  categoryTags: string[];
};

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
    }));
  }),
});
