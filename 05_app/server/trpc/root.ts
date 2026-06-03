import { commentsRouter } from "@/server/trpc/routers/comments";
import { frameworksRouter } from "@/server/trpc/routers/frameworks";
import { modulesRouter } from "@/server/trpc/routers/modules";
import { notificationsRouter } from "@/server/trpc/routers/notifications";
import { studiesRouter } from "@/server/trpc/routers/studies";
import { workspaceRouter } from "@/server/trpc/routers/workspace";
import { router } from "@/server/trpc/trpc";

export const appRouter = router({
  workspace: workspaceRouter,
  studies: studiesRouter,
  modules: modulesRouter,
  frameworks: frameworksRouter,
  comments: commentsRouter,
  notifications: notificationsRouter,
});

export type AppRouter = typeof appRouter;
