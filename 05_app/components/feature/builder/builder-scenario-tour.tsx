"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { EventData } from "react-joyride";

import { TOUR_OPTIONS, TourTooltip } from "@/components/feature/onboarding/onboarding-tour";
import { scenarioTourFor, SCENARIO_TOUR_STEPS } from "./scenario-tour-steps";

/**
 * Per-scenario Builder tour (feedback #7D). Reads `?tour=<scenario-slug>` (set by
 * the Explore use-case card's build/template CTAs), looks up the matching step
 * set, and runs ONCE per scenario — "seen" is persisted in localStorage so it
 * never re-runs, even on a hard refresh or a return visit with the param still
 * in the URL. Reuses the product tour's chrome verbatim (TourTooltip +
 * TOUR_OPTIONS) so it looks identical; it never touches OnboardingTour itself.
 *
 * Mounted only inside the Builder page, so Joyride is lazy-loaded just here.
 */
const Joyride = dynamic(() => import("react-joyride").then((m) => m.Joyride), { ssr: false });

const seenKey = (slug: string) => `mrt:builder-tour-seen:${slug}`;

export function BuilderScenarioTour() {
  const searchParams = useSearchParams();
  const slug = scenarioTourFor(searchParams.get("tour"));
  const [run, setRun] = useState(false);

  useEffect(() => {
    // No/unknown scenario, or already seen → never run.
    if (!slug) return;
    let seen = false;
    try {
      seen = window.localStorage.getItem(seenKey(slug)) === "1";
    } catch {
      // localStorage unavailable (private mode / blocked) — run once this session.
    }
    if (!seen) setRun(true);
  }, [slug]);

  if (!slug || !run) return null;

  const handleEvent = (data: EventData) => {
    // tour:end fires on finish, skip, or dismiss — mark seen in every case so it
    // won't auto-run again. Guarded; a storage failure is harmless.
    if (data.type === "tour:end") {
      setRun(false);
      try {
        window.localStorage.setItem(seenKey(slug), "1");
      } catch {
        /* no-op */
      }
    }
  };

  return (
    <Joyride
      steps={SCENARIO_TOUR_STEPS[slug]}
      run={run}
      continuous
      onEvent={handleEvent}
      options={TOUR_OPTIONS}
      tooltipComponent={TourTooltip}
      locale={{ back: "Back", close: "Close", last: "Done", next: "Next", skip: "Skip" }}
    />
  );
}
