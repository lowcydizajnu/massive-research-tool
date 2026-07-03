"use client";

import { useUser } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type { EventData, Step, TooltipRenderProps } from "react-joyride";

import { markTourSeen } from "@/app/actions/complete-tour";

/**
 * Custom tour tooltip (feedback #10e). Joyride's `options` only swaps a few
 * colours — not enough to look like the app — so we render the whole card
 * ourselves: a parchment-surface card with a Plex-Serif title, left-aligned
 * body, a step counter, and the app's emerald primary button + quiet
 * Back/Skip/close. Spread the render-props joyride passes for behaviour.
 */
export function TourTooltip({
  index,
  size,
  step,
  isLastStep,
  backProps,
  closeProps,
  primaryProps,
  skipProps,
  tooltipProps,
}: TooltipRenderProps) {
  return (
    <div
      {...tooltipProps}
      className="relative w-[360px] max-w-[90vw] rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-5 text-left shadow-[var(--shadow-md)]"
    >
      <button
        {...closeProps}
        className="absolute right-3 top-3 rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-text-secondary)]"
      >
        <X className="size-4" aria-hidden />
      </button>

      {step.title ? (
        <h2 className="pr-6 font-serif text-[length:var(--text-heading-2)] font-medium text-[var(--color-ink-deep)]">
          {step.title}
        </h2>
      ) : null}
      <div className="mt-2 text-[length:var(--text-body)] leading-relaxed text-[var(--color-text-secondary)]">
        {step.content}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        {!isLastStep ? (
          <button
            {...skipProps}
            className="text-[length:var(--text-small)] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
          >
            Skip
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <span className="text-[length:var(--text-small)] tabular-nums text-[var(--color-text-muted)]">
            {index + 1} of {size}
          </span>
          {index > 0 ? (
            <button
              {...backProps}
              className="rounded-[var(--radius-md)] px-2.5 py-1 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
            >
              Back
            </button>
          ) : null}
          <button
            {...primaryProps}
            className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-white outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
          >
            {isLastStep ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Shared Joyride behaviour/scrim config (the visual card is <TourTooltip>).
 * Exported so the per-scenario Builder tour (#7D) runs with identical chrome.
 * skipBeacon → tooltips show immediately; scrim-click / Esc = skip; arrowColor
 * matches the card surface so the pointer blends in.
 */
export const TOUR_OPTIONS = {
  zIndex: 70,
  overlayColor: "rgba(0,0,0,0.45)",
  arrowColor: "var(--color-surface-canvas)",
  skipBeacon: true,
  skipScroll: true,
  overlayClickAction: "close" as const,
  dismissKeyAction: "close" as const,
};

// Lazy-load react-joyride (ADR-0072) only when the tour actually runs — keeps it
// out of the shared bundle for the common case (returning users). v3 has no
// default export; the component is the named `Joyride`. ssr:false: portal/DOM lib.
const Joyride = dynamic(() => import("react-joyride").then((m) => m.Joyride), { ssr: false });

/**
 * First-run product tour (platform-foundation PF3.1). Runs once for a new
 * researcher on the Studies landing, then never again — completion/skip is
 * stored in Clerk publicMetadata (`hasSeenTour`) via markTourSeen(), so it
 * survives device changes. Re-triggerable from Settings · Account via
 * `?tour=replay`. Only mounts where its targets exist (workspace chrome on
 * /studies), so steps never point at missing elements.
 */
const STEPS: Step[] = [
  {
    target: "body",
    placement: "center",
    title: "Welcome to My Research Lab",
    content: "A quick 30-second tour of where things live. You can skip anytime.",
  },
  {
    target: '[data-tour="left-rail"]',
    title: "Your destinations",
    content: "Studies, Library, Activity, and more. Click any destination to dive in.",
  },
  {
    target: '[data-tour="new-study"]',
    title: "Create a study",
    content: "Start a new study from scratch or from a framework. This is where every study begins.",
  },
  {
    target: '[data-tour="feedback"]',
    title: "Tell us anything",
    content:
      "Hit this button any time to send feedback or report a bug — it can attach a screenshot of the page automatically. We read every note.",
  },
  {
    target: "body",
    placement: "center",
    title: "You're set",
    content: "That's it. You can replay this tour anytime from Settings · Account.",
  },
];

export function OnboardingTour() {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn, user } = useUser();
  const [run, setRun] = useState(false);

  const replay = searchParams.get("tour") === "replay";
  // Only the Studies landing carries the targets ([data-tour] elements live in
  // workspace chrome); auto-run there, or anywhere when explicitly replaying.
  const onTargetSurface = pathname.startsWith("/studies");

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) return;
    if (!onTargetSurface) return;
    const seen = user.publicMetadata?.hasSeenTour === true;
    if (replay || !seen) setRun(true);
  }, [isLoaded, isSignedIn, user, onTargetSurface, replay]);

  if (!run) return null;

  const handleEvent = (data: EventData) => {
    // tour:end fires on finish, skip, or dismiss — mark seen in every case so it
    // won't auto-run again (the write is fire-and-forget; failure is harmless).
    if (data.type === "tour:end") {
      setRun(false);
      void markTourSeen();
    }
  };

  return (
    <Joyride
      steps={STEPS}
      run={run}
      continuous
      onEvent={handleEvent}
      options={TOUR_OPTIONS}
      tooltipComponent={TourTooltip}
      locale={{ back: "Back", close: "Close", last: "Done", next: "Next", skip: "Skip" }}
    />
  );
}
