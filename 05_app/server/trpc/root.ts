import { frameworksRouter } from "@/server/trpc/routers/frameworks";
import { modulesRouter } from "@/server/trpc/routers/modules";
import { studiesRouter } from "@/server/trpc/routers/studies";
import { workspaceRouter } from "@/server/trpc/routers/workspace";
import { router } from "@/server/trpc/trpc";

export const appRouter = router({
  workspace: workspaceRouter,
  studies: studiesRouter,
  modules: modulesRouter,
  frameworks: frameworksRouter,
});

export type AppRouter = typeof appRouter;
