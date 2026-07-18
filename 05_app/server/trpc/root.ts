import { adminRouter } from "@/server/trpc/routers/admin";
import { aiRouter } from "@/server/trpc/routers/ai";
import { announcementsRouter } from "@/server/trpc/routers/announcements";
import { commentsRouter } from "@/server/trpc/routers/comments";
import { cookieConsentRouter } from "@/server/trpc/routers/cookie-consent";
import { dashboardRouter } from "@/server/trpc/routers/dashboard";
import { exploreRouter } from "@/server/trpc/routers/explore";
import { feedbackRouter } from "@/server/trpc/routers/feedback";
import { followsRouter } from "@/server/trpc/routers/follows";
import { legalRouter } from "@/server/trpc/routers/legal";
import { materialsRouter } from "@/server/trpc/routers/materials";
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
import { templatesRouter } from "@/server/trpc/routers/templates";
import { uploadsRouter } from "@/server/trpc/routers/uploads";
import { pidsRouter } from "@/server/trpc/routers/pids";
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
  explore: exploreRouter,
  modules: modulesRouter,
  proposals: proposalsRouter,
  templates: templatesRouter,
  materials: materialsRouter,
  comments: commentsRouter,
  cookieConsent: cookieConsentRouter,
  legal: legalRouter,
  feedback: feedbackRouter,
  announcements: announcementsRouter,
  admin: adminRouter,
  notifications: notificationsRouter,
  follows: followsRouter,
  me: meRouter,
  profile: profileRouter,
  previewTokens: previewTokensRouter,
  uploads: uploadsRouter,
  pids: pidsRouter,
});

export type AppRouter = typeof appRouter;
