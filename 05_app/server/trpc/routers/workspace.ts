import { router, workspaceProcedure } from "@/server/trpc/trpc";

export type ActiveWorkspace = {
  id: string;
  name: string;
  slug: string;
};

export const workspaceRouter = router({
  /** The current user's active workspace (chrome: workspace chip + breadcrumb). */
  active: workspaceProcedure.query(({ ctx }): ActiveWorkspace => ({
    id: ctx.workspace.id,
    name: ctx.workspace.name,
    slug: ctx.workspace.slug,
  })),
});
