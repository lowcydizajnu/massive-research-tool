"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Force-watch video (feedback 01KWCFEFBQ, ADR-0013 island): the participant must
 * finish the video before the screen's Continue button (`data-take-continue`)
 * re-enables, and can't skip ahead of what they've watched. Re-enables on error /
 * unmount so a participant is never stranded. Native `<video>` only — embeds can't
 * be tracked. Mirrors ForcedWaitInput's button-gating contract.
 */
export function ForceWatchVideo({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  const maxWatched = useRef(0);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const btn = document.querySelector<HTMLButtonElement>("[data-take-continue]");
    if (btn) btn.disabled = !done;
    return () => {
      if (btn) btn.disabled = false; // never strand on unmount
    };
  }, [done]);

  const enable = () => setDone(true);

  return (
    <video
      ref={ref}
      src={url}
      controls
      controlsList="nodownload noplaybackrate"
      onContextMenu={(e) => e.preventDefault()}
      className="h-full w-full"
      onTimeUpdate={(e) => {
        const v = e.currentTarget;
        if (v.currentTime > maxWatched.current) maxWatched.current = v.currentTime;
      }}
      onSeeking={(e) => {
        const v = e.currentTarget;
        // Block skipping past what's actually been watched (small tolerance).
        if (!done && v.currentTime > maxWatched.current + 0.5) v.currentTime = maxWatched.current;
      }}
      onEnded={enable}
      onError={enable}
    />
  );
}
