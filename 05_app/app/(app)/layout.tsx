import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PostHogProvider } from "@/components/analytics/posthog-provider";
import { AppFooter } from "@/components/chrome/app-footer";
import { ViewAsBanner } from "@/components/feature/admin/view-as-banner";
import { FeedbackWidget } from "@/components/feature/feedback/feedback-widget";
import { LegalUpdateModal } from "@/components/feature/legal/legal-update-modal";
import { NewStudyProvider } from "@/components/feature/new-study/provider";
import { OnboardingTour } from "@/components/feature/onboarding/onboarding-tour";
import { TRPCReactProvider } from "@/lib/trpc/react";
import { auth } from "@/server/adapters/auth";

/**
 * Authenticated shell — providers + onboarding guard only. The chrome lives in
 * the two sibling route groups (IA v0.4, ADR-0032): `(workspace)` renders the
 * destination chrome (TopBar + LeftRail), `(study)` renders the slim focused
 * top bar. The mode switch IS the URL — no client branching here.
 *
 * Routes under (app) are protected by middleware.ts. The gate here is ONBOARDING,
 * not workspace-presence: an onboarded researcher may legitimately have zero
 * *active* workspaces (they archived them all, ADR-0090) and still belongs on Home
 * (personal mode needs no workspace). Only a not-yet-onboarded user is sent to
 * /signup. Workspace-mode routes that do need one redirect to /home themselves.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await auth.getCurrentUser();
  if (!user?.hasCompletedOnboarding) redirect("/signup");

  return (
    <TRPCReactProvider>
      <PostHogProvider>
        <NewStudyProvider>
          <div className="flex min-h-screen flex-col bg-[var(--color-surface-page)]">
            <ViewAsBanner />
            {children}
            <AppFooter />
          </div>
          <LegalUpdateModal />
          <FeedbackWidget />
          <Suspense fallback={null}>
            <OnboardingTour />
          </Suspense>
        </NewStudyProvider>
      </PostHogProvider>
    </TRPCReactProvider>
  );
}
