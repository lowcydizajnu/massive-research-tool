"use client";

import { useEffect, useRef } from "react";

/**
 * Full-bleed closing video beat for the marketing landing. The clip plays only
 * when at least half of the section is on screen (owner direction) and pauses
 * when it scrolls away — an IntersectionObserver at threshold 0.5 drives
 * play()/pause(). Muted + playsInline so autoplay is allowed on mobile Safari;
 * loops so it keeps running while in view. The headline sits on a dark scrim.
 *
 * Proposal-only component (the "Scenes" landing). No design tokens by intent —
 * the Scenes variant runs a free, illustration-sampled palette.
 */
export function VideoRelax({ src, heading }: { src: string; heading: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    // Respect reduced-motion: don't autoplay if the user opted out.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="relative isolate flex min-h-[80vh] items-center justify-center overflow-hidden px-6 py-24 text-center">
      <video
        ref={videoRef}
        className="absolute inset-0 -z-10 size-full object-cover"
        src={src}
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden
      />
      <div className="absolute inset-0 -z-10 bg-black/55" aria-hidden />
      <h2 className="max-w-3xl font-serif text-[2.75rem] font-medium leading-[1.05] text-white sm:text-[4.5rem]">
        {heading}
      </h2>
    </section>
  );
}
