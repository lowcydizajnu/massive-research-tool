import { commentsRouter } from "@/server/trpc/routers/comments";
import { followsRouter } from "@/server/trpc/routers/follows";
import { frameworksRouter } from "@/server/trpc/routers/frameworks";
import { modulesRouter } from "@/server/trpc/routers/modules";
import { proposalsRouter } from "@/server/trpc/routers/proposals";
import { notificationsRouter } from "@/server/trpc/routers/notifications";
import { previewTokensRouter } from "@/server/trpc/routers/preview-tokens";
import { profileRouter } from "@/server/trpc/routers/profile";
import { studiesRouter } from "@/server/trpc/routers/studies";
import { uploadsRouter } from "@/server/trpc/routers/uploads";
import { workspaceRouter } from "@/server/trpc/routers/workspace";
import { router } from "@/server/trpc/trpc";

export const appRouter = router({
  workspace: workspaceRouter,
  studies: studiesRouter,
  modules: modulesRouter,
  proposals: proposalsRouter,
  frameworks: frameworksRouter,
  comments: commentsRouter,
  notifications: notificationsRouter,
  follows: followsRouter,
  profile: profileRouter,
  previewTokens: previewTokensRouter,
  uploads: uploadsRouter,
});

export type AppRouter = typeof appRouter;
