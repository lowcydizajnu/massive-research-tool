import { aiRouter } from "@/server/trpc/routers/ai";
import { commentsRouter } from "@/server/trpc/routers/comments";
import { dashboardRouter } from "@/server/trpc/routers/dashboard";
import { followsRouter } from "@/server/trpc/routers/follows";
import { frameworksRouter } from "@/server/trpc/routers/frameworks";
import { meRouter } from "@/server/trpc/routers/me";
import { modulesRouter } from "@/server/trpc/routers/modules";
import { panelsRouter } from "@/server/trpc/routers/panels";
import { playgroundRouter } from "@/server/trpc/routers/playground";
import { presenceRouter } from "@/server/trpc/routers/presence";
import { proposalsRouter } from "@/server/trpc/routers/proposals";
import { notificationsRouter } from "@/server/trpc/routers/notifications";
import { previewTokensRouter } from "@/server/trpc/routers/preview-tokens";
import { profileRouter } from "@/server/trpc/routers/profile";
import { recruitmentRouter } from "@/server/trpc/routers/recruitment";
import { savedRouter } from "@/server/trpc/routers/saved";
import { studiesRouter } from "@/server/trpc/routers/studies";
import { studyRecordRouter } from "@/server/trpc/routers/study-record";
import { teamRouter } from "@/server/trpc/routers/team";
import { uploadsRouter } from "@/server/trpc/routers/uploads";
import { workspaceRouter } from "@/server/trpc/routers/workspace";
import { router } from "@/server/trpc/trpc";

export const appRouter = router({
  ai: aiRouter,
  workspace: workspaceRouter,
  team: teamRouter,
  recruitment: recruitmentRouter,
  panels: panelsRouter,
  playground: playgroundRouter,
  presence: presenceRouter,
  studies: studiesRouter,
  studyRecord: studyRecordRouter,
  saved: savedRouter,
  dashboard: dashboardRouter,
  modules: modulesRouter,
  proposals: proposalsRouter,
  frameworks: frameworksRouter,
  comments: commentsRouter,
  notifications: notificationsRouter,
  follows: followsRouter,
  me: meRouter,
  profile: profileRouter,
  previewTokens: previewTokensRouter,
  uploads: uploadsRouter,
});

export type AppRouter = typeof appRouter;
