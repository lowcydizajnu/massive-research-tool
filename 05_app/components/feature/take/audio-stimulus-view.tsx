"use client";

import { useRef, useState } from "react";

/**
 * Participant-facing audio-stimulus player (ADR-0069). Plays the researcher-
 * generated clip stored on the block config. Delivery (no response). Playback
 * modes: "replayable" (full native controls), "once" (controls disable after the
 * first full play), "forced" (must reach the end — a note explains it; the clip
 * still uses native controls so it's keyboard-operable). Full Continue-button
 * gating for forced-listen is a take-chrome follow-up (wireframe open question);
 * this renders the player + the forced-listen messaging.
 */
export function AudioStimulusView({ config }: { config: Record<string, unknown> }) {
  const url = typeof config.audioUrl === "string" ? config.audioUrl : "";
  const playback = config.playback === "once" || config.playback === "forced" ? config.playback : "replayable";
  const audioRef = useRef<HTMLAudioElement>(null);
  const [played, setPlayed] = useState(false);
  const [finished, setFinished] = useState(false);

  if (!url) {
    return (
      <p className="text-[length:var(--text-body)] text-[var(--color-text-muted)]">
        This audio isn’t available yet — please contact the researcher.
      </p>
    );
  }

  const lockedAfterOnce = playback === "once" && played && finished;

  return (
    <div className="flex flex-col gap-2">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        src={url}
        controls={!lockedAfterOnce}
        controlsList={playback === "forced" ? "nodownload noplaybackrate" : "nodownload"}
        onPlay={() => setPlayed(true)}
        onEnded={() => setFinished(true)}
        className="w-full"
      />
      {playback === "once" ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {lockedAfterOnce ? "You’ve played this audio." : "You can play this audio once."}
        </p>
      ) : null}
      {playback === "forced" && !finished ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Please listen to the end to continue.
        </p>
      ) : null}
    </div>
  );
}
