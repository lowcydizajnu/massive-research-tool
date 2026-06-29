import Link from "next/link";
import type { Route } from "next";
import { ArrowRight } from "lucide-react";

import { LandingSwitcher } from "@/components/feature/marketing/landing-switcher";

/**
 * Landing proposal B — the BOLD direction from the owner's Figma
 * (xwjo5GPhnSSIWcgmdYbm4h): full-bleed 3D-illustration scenes, oversized
 * Plex Serif headlines on imagery, "Tired of…" + "Relax. Take your space."
 * Figma copy kept as section beats; the product value-prop + CTAs are woven in
 * from landing-page-content.md (the doc = copy truth, Figma = visual truth).
 *
 * Assets are the Figma renders downloaded to /public/marketing/figma/. This is
 * a comparison proposal — switch via the floating toggle (LandingSwitcher).
 * Plain <img> (not next/image) keeps it dependency-free for the proposal.
 */
const IMG = "/marketing/figma";

function Pill({ href, children, dark }: { href: string; children: React.ReactNode; dark?: boolean }) {
  return (
    <Link
      href={href as Route}
      className={`inline-flex items-center gap-2 rounded-full px-6 py-3 text-[length:var(--text-body)] font-medium ${
        dark ? "bg-[var(--color-text-primary)] text-[var(--color-surface-canvas)]" : "bg-white text-[#101312]"
      } hover:opacity-90`}
    >
      {children}
    </Link>
  );
}

export function LandingPageBold() {
  return (
    <main className="overflow-x-hidden bg-[var(--color-surface-canvas)]">
      <LandingSwitcher current="bold" />

      {/* Hero — full-bleed scene + oversized serif headline */}
      <section className="relative isolate flex min-h-[88vh] items-center justify-center px-6 py-24 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${IMG}/bg-top.png`} alt="" className="absolute inset-0 -z-10 size-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-black/45" aria-hidden />
        <div className="flex max-w-3xl flex-col items-center gap-6">
          <h1 className="font-serif text-[2.75rem] font-bold leading-[1.05] tracking-[-0.01em] text-white sm:text-[4.5rem]">
            Replicate any study in one click.
          </h1>
          <p className="max-w-xl text-[length:var(--text-body)] leading-relaxed text-white/85 sm:text-[18px]">
            Design, preregister, recruit, run, analyze — all in one workspace. Your OSF, Prolific, and AI vendor accounts
            connect through.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Pill href="/signup">
              Start free <ArrowRight className="size-4" aria-hidden />
            </Pill>
            <Link href={"/explore" as Route} className="rounded-full border border-white/40 px-6 py-3 text-[length:var(--text-body)] font-medium text-white hover:bg-white/10">
              Browse the library
            </Link>
          </div>
        </div>
      </section>

      {/* Tired of… — pain points beside the lounging figure */}
      <section className="bg-[#0A0E0C] px-6 py-24">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 md:grid-cols-2">
          <div className="flex flex-col gap-6">
            <h2 className="font-serif text-[3rem] font-bold leading-none text-white sm:text-[5rem]">Tired of…</h2>
            <ul className="flex flex-col gap-3 text-[length:var(--text-body)] text-white/80">
              {[
                "Rebuilding the same study three times across three tools to run it once.",
                "Replicating a published study meaning rebuilding it from the methods section.",
                "Losing track of which version your last 200 participants saw.",
                "Modern stimuli — audio, voice, emotion scoring — being impossible or a hack.",
                "Paying per response when your grant already pays for participants.",
              ].map((p) => (
                <li key={p} className="flex items-start gap-3">
                  <ArrowRight className="mt-1 size-4 shrink-0 text-[var(--color-primary)]" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${IMG}/orange-lounge.png`} alt="A researcher taking a break" className="mx-auto w-full max-w-md rounded-[var(--radius-lg)] object-contain" />
        </div>
      </section>

      {/* Community — scattered figures */}
      <section className="relative bg-[var(--color-surface-canvas)] px-6 py-24">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-8 text-center">
          <h2 className="font-serif text-[2rem] font-bold leading-tight text-[var(--color-text-primary)] sm:text-[3rem]">
            Real studies from real researchers
          </h2>
          <p className="max-w-2xl text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
            Browse published methodologies. Replicate any of them in one click. Be among the first to grow the open
            library.
          </p>
          <div className="flex flex-wrap items-end justify-center gap-6">
            {["fig1", "fig2", "fig3", "fig4"].map((f) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={f} src={`${IMG}/${f}.png`} alt="" className="h-44 w-auto object-contain sm:h-56" />
            ))}
          </div>
          <Pill href="/explore" dark>
            Browse all studies <ArrowRight className="size-4" aria-hidden />
          </Pill>
        </div>
      </section>

      {/* Relax. Take your space. — emotional dark beat (Figma headline kept) */}
      <section className="relative isolate flex min-h-[70vh] items-center justify-center px-6 py-24 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${IMG}/room.png`} alt="" className="absolute inset-0 -z-10 size-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-black/55" aria-hidden />
        <div className="flex max-w-3xl flex-col items-center gap-6">
          <h2 className="font-serif text-[2.75rem] font-bold leading-[1.05] text-white sm:text-[4.5rem]">
            Relax. Take your space.
          </h2>
          <p className="max-w-xl text-[length:var(--text-body)] text-white/85">
            Free for individual researchers. Pay what feels right above that. No per-response fees, no lock-in.
          </p>
          <Pill href="/signup">Sign up</Pill>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-[var(--color-surface-canvas)] px-6 py-24 text-center">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-5">
          <h2 className="font-serif text-[2.5rem] font-bold leading-tight text-[var(--color-text-primary)] sm:text-[3.5rem]">
            Ready to run better research?
          </h2>
          <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
            Free for individual researchers. Institutional partnerships available.
          </p>
          <Pill href="/signup" dark>
            Start your first study <ArrowRight className="size-4" aria-hidden />
          </Pill>
        </div>
      </section>

      <footer className="border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-6 py-10 text-center">
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">© 2026 My Research Lab — built by Paweł Rosner</p>
      </footer>
    </main>
  );
}
