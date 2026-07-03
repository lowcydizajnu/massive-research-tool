"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { scenarioTourFor } from "@/components/feature/builder/scenario-tour-steps";
import { STARTER_MISINFO_TEMPLATE_ID } from "@/lib/system/starter";
import { forkTemplateAction } from "@/server/templates/fork-template";

/**
 * "Start the guided tutorial" — the on-demand entry to hands-on onboarding (owner
 * 2026-07-02). Forks the misinformation starter into the current workspace and
 * drops the researcher into the Builder with the `misinformation-study` scenario
 * coachmark tour (SCENARIO_TOUR_STEPS) that walks the whole loop — build → adapt →
 * preview → save → conditions → recruit → results. Reuses the Explore scenario
 * machinery (ADR-0076 + feedback #7D) rather than redirect-and-abandon. Surfaced
 * where new users land: the Studies empty state + the Start-here card.
 */
export function StartTutorialButton({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function start() {
    if (pending) return;
    setPending(true);
    try {
      const { id } = await forkTemplateAction({ templateId: STARTER_MISINFO_TEMPLATE_ID });
      const tour = scenarioTourFor("misinformation-study");
      router.push(`/studies/${id}/build${tour ? `?tour=${tour}` : ""}` as Route);
    } catch {
      setPending(false); // global toast surfaces the error; the button re-enables
    }
  }

  return (
    <button type="button" onClick={start} disabled={pending} className={className}>
      {pending ? "Setting up your tutorial…" : (children ?? "Start the guided tutorial")}
    </button>
  );
}
