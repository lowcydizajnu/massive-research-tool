"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Force-watch video (feedback 01KWCFEFBQ, ADR-0013 island): the participant must
 * finish the video before the screen's Continue button (`data-take-continue`)
 * re-enables, and can't skip ahead of what they've watched. Re-enables on error /
 * unmount so a participant is never stranded. Native `<video>` only — embeds can't
 * be tracked. Mirrors ForcedWaitInput's button-gating contract.
 */
export function ForceWatchVideo({ url, np }: { url: string; np: string }) {
  const [done, setDone] = useState(false);
  const maxWatched = useRef(0);
  const watchedMs = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const btn = document.querySelector<HTMLButtonElement>("[data-take-continue]");
    if (btn) btn.disabled = !done;
    return () => {
      if (btn) btn.disabled = false; // never strand on unmount
    };
  }, [done]);

  const enable = () => setDone(true);

  return (
    <>
      {/* Captured by the take action (extractAnswer "video") → answer.watched. */}
      <input type="hidden" name={`${np}watched`} value={done ? "true" : "false"} />
      <input ref={watchedMs} type="hidden" name={`${np}watchedMs`} defaultValue="0" />
      <video
        src={url}
        controls
        controlsList="nodownload noplaybackrate"
        onContextMenu={(e) => e.preventDefault()}
        className="h-full w-full"
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (v.currentTime > maxWatched.current) maxWatched.current = v.currentTime;
          if (watchedMs.current) watchedMs.current.value = String(Math.round(maxWatched.current * 1000));
        }}
        onSeeking={(e) => {
          const v = e.currentTarget;
          // Block skipping past what's actually been watched (small tolerance).
          if (!done && v.currentTime > maxWatched.current + 0.5) v.currentTime = maxWatched.current;
        }}
        onEnded={enable}
        onError={enable}
      />
    </>
  );
}
