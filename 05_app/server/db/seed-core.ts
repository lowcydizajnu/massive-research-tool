import { db } from "@/server/db/client";
import { moduleTable, moduleVersion } from "@/server/db/schema";
import { MODULE_REGISTRY } from "@/server/modules/registry";

/**
 * Seed the V1 core module catalogue (ADR-0012) from the in-repo registry.
 * Idempotent — safe to run repeatedly (upserts the Module, no-ops the version).
 */
export async function seedCoreModules(): Promise<void> {
  for (const def of MODULE_REGISTRY) {
    const [m] = await db
      .insert(moduleTable)
      .values({
        source: def.source,
        key: def.key,
        name: def.name,
        description: def.description,
        categoryTags: def.categoryTags,
      })
      .onConflictDoUpdate({
        target: [moduleTable.source, moduleTable.key],
        set: {
          name: def.name,
          description: def.description,
          categoryTags: def.categoryTags,
        },
      })
      .returning();

    // Archived modules (e.g. voice-emotion-probe after Hume EM was discontinued)
    // are seeded but marked deprecated so the Builder picker (deprecatedAt IS NULL)
    // hides them; existing studies still resolve. Re-seeding syncs the flag.
    const deprecatedAt = def.archived ? new Date() : null;
    await db
      .insert(moduleVersion)
      .values({
        moduleId: m.id,
        version: def.version,
        name: def.name,
        schema: def.jsonSchema,
        defaultConfig: def.defaultConfig,
        deprecatedAt,
      })
      .onConflictDoUpdate({
        target: [moduleVersion.moduleId, moduleVersion.version],
        set: { deprecatedAt },
      });
  }
}
