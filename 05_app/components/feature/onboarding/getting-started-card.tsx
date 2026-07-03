"use client";

import { useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, X } from "lucide-react";

import { dismissGettingStarted } from "@/app/actions/dismiss-getting-started";
import { openStudyAction } from "@/app/actions/switch-workspace";
import { useNewStudy } from "@/components/feature/new-study/context";
import { StartTutorialButton } from "@/components/feature/onboarding/start-tutorial-button";
import type { GettingStartedState } from "@/server/trpc/routers/me";

/**
 * "Start here" getting-started card (getting-started-checklist.md; ADR-0045 am.
 * 2026-07-02). A PINNED card rendered above the widget grid on BOTH dashboards
 * (personal /home + workspace /dashboard) — deliberately NOT a customizable
 * widget, so a saved dashboard layout can't hide it. Shows until every step is
 * done (derived server-side, `state`) OR the researcher dismisses it with the ×
 * (persisted cross-device via publicMetadata, read client-side like the tour).
 *
 * Step routing (never navigates to /studies, so the first-run tour can't re-fire):
 *  - "Create your first study" opens the New-study modal directly.
 *  - Study steps (block / preregister / recruit / results) open the same modal
 *    while the user has no study — creating one is the real prerequisite — and
 *    deep-link INTO the newest study once it exists (openStudyAction switches
 *    the active workspace, so it's correct across multiple workspaces).
 *  - Community steps link to Browse / Team / Settings.
 * Client (ADR-0013) so it can open the modal + optimistically hide on ×. The
 * `dismissed` flag is resolved SERVER-side (passed in) so a dismissed card never
 * renders — no flash, no client Clerk read.
 */
type Step = {
  label: string;
  hint?: string;
  done: boolean;
  kind: "create" | "study" | "link";
  stage?: "build" | "run" | "results";
  href?: Route;
};

export function GettingStartedCard({ state, dismissed }: { state: GettingStartedState; dismissed: boolean }) {
  const { open: openNewStudy } = useNewStudy();
  const router = useRouter();
  const [hidden, setHidden] = useState(false);

  const steps: Step[] = [
    { label: "Create your first study", done: state.createdStudy, kind: "create" },
    {
      label: "Add your first block",
      hint: "Try a fully interactive Social post or a live AI conversation.",
      done: state.addedBlock,
      kind: "study",
      stage: "build",
    },
    { label: "Preregister or publish", done: state.preregisteredOrPublished, kind: "study", stage: "run" },
    { label: "Open recruitment", done: state.openedRecruitment, kind: "study", stage: "run" },
    { label: "See your first results", done: state.firstResults, kind: "study", stage: "results" },
    { label: "Save a study from Browse", done: state.savedStudy, kind: "link", href: "/browse" },
    { label: "Invite a teammate", done: state.invitedTeammate, kind: "link", href: "/team" },
    { label: "Connect your OSF account", done: state.connectedOsf, kind: "link", href: "/settings/account" },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  // `dismissed` is server-resolved (no flash); `hidden` is the optimistic hide
  // after clicking ×; all-done self-hides. Any of the three → don't render.
  if (hidden || dismissed || doneCount === steps.length) return null;

  const onDismiss = () => {
    setHidden(true); // optimistic; persisted below so it stays hidden on reload
    void dismissGettingStarted().then(() => router.refresh());
  };

  return (
    <section
      aria-labelledby="getting-started-title"
      className="relative flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-5"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss the getting-started checklist"
        className="absolute right-3 top-3 rounded-[var(--radius-md)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-text-secondary)]"
      >
        <X className="size-4" aria-hidden />
      </button>
      <div className="flex flex-col gap-0.5 pr-8">
        <h2 id="getting-started-title" className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">
          Start here
        </h2>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {doneCount} of {steps.length} done — your first steps, ticked off automatically as you go.
        </p>
      </div>
      {/* Prefer the hands-on path: a guided tutorial that builds a real study and
          walks each step, vs. ticking the list alone (owner 2026-07-02). */}
      <StartTutorialButton className="inline-flex w-fit items-center rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-white hover:opacity-90 disabled:opacity-50">
        New here? Take the guided tutorial →
      </StartTutorialButton>
      <ul className="grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
        {steps.map((step) => (
          <li key={step.label} className="flex items-start gap-2">
            {step.done ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--color-success-text-on-subtle)]" aria-hidden />
            ) : (
              <Circle className="mt-0.5 size-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
            )}
            <span className="flex min-w-0 flex-col">
              <StepControl step={step} study={state.latestStudy} openNewStudy={openNewStudy} />
              {step.hint && !step.done ? (
                <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{step.hint}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StepControl({
  step,
  study,
  openNewStudy,
}: {
  step: Step;
  study: GettingStartedState["latestStudy"];
  openNewStudy: () => void;
}) {
  const base = "text-left text-[length:var(--text-body)]";
  if (step.done) {
    return (
      <span className={`${base} text-[var(--color-text-muted)]`}>
        {step.label}
        <span className="sr-only"> — done</span>
      </span>
    );
  }
  const link = `${base} text-[var(--color-primary)] hover:underline`;
  // Create step, or any study step while there's no study yet → prompt to create
  // one (the true prerequisite). Opens the modal; no /studies navigation.
  if (step.kind === "create" || (step.kind === "study" && !study)) {
    return (
      <button type="button" onClick={openNewStudy} className={link}>
        {step.label}
        <span className="sr-only"> — not done yet</span>
      </button>
    );
  }
  // Study step with a study → deep-link into it (switches active workspace).
  if (step.kind === "study" && study) {
    return (
      <form action={openStudyAction.bind(null, study.workspaceId, study.studyId, step.stage ?? "build")}>
        <button type="submit" className={link}>
          {step.label}
          <span className="sr-only"> — not done yet</span>
        </button>
      </form>
    );
  }
  return (
    <Link href={step.href ?? "/studies"} className={link}>
      {step.label}
      <span className="sr-only"> — not done yet</span>
    </Link>
  );
}
