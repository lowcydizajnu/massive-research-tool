"use client";

import { useUser } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { EventData, Step } from "react-joyride";

import { markTourSeen } from "@/app/actions/complete-tour";

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
    title: "Welcome to Massive Research Lab",
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

  const options = useMemo(
    () => ({
      primaryColor: "#047144", // brand CTA green (matches the primary CTA token)
      textColor: "#1c1a17",
      overlayColor: "rgba(0,0,0,0.45)",
      zIndex: 70,
      showProgress: true, // "2 / 4" in the tooltip footer
      skipBeacon: true, // continuous tour — show tooltips immediately, no beacon dots
      skipScroll: true, // respect reduced motion; targets are above the fold
      overlayClickAction: "close" as const, // click the scrim = skip
      dismissKeyAction: "close" as const, // Esc = skip
    }),
    [],
  );

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
      options={options}
      locale={{ back: "Back", close: "Close", last: "Done", next: "Next", skip: "Skip" }}
    />
  );
}
