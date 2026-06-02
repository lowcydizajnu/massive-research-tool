import { studiesRouter } from "@/server/trpc/routers/studies";
import { workspaceRouter } from "@/server/trpc/routers/workspace";
import { router } from "@/server/trpc/trpc";

export const appRouter = router({
  workspace: workspaceRouter,
  studies: studiesRouter,
});

export type AppRouter = typeof appRouter;
