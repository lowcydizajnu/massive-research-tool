"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { Route } from "next";

/**
 * Closing video beat for the "Scenes" landing. Contained to the same centered
 * column as the other sections (max-w-6xl) with the shared rounded-[20px] image
 * radius — NOT full-bleed (owner). The clip plays only when at least half the
 * card is on screen and pauses when it scrolls away (IntersectionObserver at
 * threshold 0.5, reduced-motion respected). Muted + playsInline so autoplay is
 * allowed; loops while in view. The headline matches the section-title size and
 * a "Sign up" pill matches the Scenes Primary button (orange).
 *
 * Proposal-only component — no design tokens by intent (Scenes uses a free,
 * illustration-sampled palette).
 */
const ORANGE = "#E2692E";

export function VideoRelax({
  src,
  heading,
  ctaHref = "/signup",
  ctaLabel = "Sign up",
}: {
  src: string;
  heading: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
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
    <section className="mx-auto w-full max-w-6xl px-6 pb-24">
      <div className="relative isolate flex min-h-[440px] items-center justify-center overflow-hidden rounded-[20px] px-6 py-20 text-center">
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
        <div className="flex flex-col items-center gap-6">
          <h2 className="font-serif text-[2.25rem] font-medium leading-tight text-white sm:text-[3rem]">{heading}</h2>
          <Link
            href={ctaHref as Route}
            className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[16px] font-medium text-white hover:opacity-90"
            style={{ backgroundColor: ORANGE }}
          >
            {ctaLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}
