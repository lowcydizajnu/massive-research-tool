import { FRAMEWORK_REGISTRY } from "@/server/frameworks/registry";
import { router, workspaceProcedure } from "@/server/trpc/trpc";

export type CatalogueFramework = {
  key: string;
  name: string;
  description: string;
  blockCount: number;
};

export const frameworksRouter = router({
  /** Frameworks a new study can start from (New-study modal's Framework picker). */
  list: workspaceProcedure.query((): CatalogueFramework[] =>
    FRAMEWORK_REGISTRY.map((f) => ({
      key: f.key,
      name: f.name,
      description: f.description,
      blockCount: f.blocks.length,
    })),
  ),
});
