import Link from "next/link";
import type { Route } from "next";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  Coffee,
  Eye,
  GitCommit,
  GitFork,
  KeyRound,
  Lightbulb,
  Mic,
  Pencil,
  PlayCircle,
  PlugZap,
  Puzzle,
  ShieldCheck,
  Sprout,
  Stamp,
  TreePine,
  Users,
  UsersRound,
} from "lucide-react";

import { LandingSwitcher } from "@/components/feature/marketing/landing-switcher";

/**
 * Landing proposal C — "Scenes": Minimal's content + copy, but DARK with white
 * type throughout, using the Figma illustration board (node 7:67) renders as
 * section hero images + tile decorations. Same copy as Minimal. Assets in
 * /public/marketing/figma/scenes/. Comparison proposal — switch via the toggle.
 * Plain <img> (proposal-only).
 */
const S = "/marketing/figma/scenes";
const SCENES = ["scene-a", "scene-b", "scene-c", "scene-d", "scene-e", "scene-f", "scene-g", "scene-h"];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[length:var(--text-label)] font-medium uppercase tracking-[0.12em] text-[var(--color-primary)]">
      <span className="mr-1.5 inline-block size-1.5 rounded-full bg-[var(--color-primary)]" aria-hidden />
      {children}
    </p>
  );
}

function Primary({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href as Route} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-[16px] font-medium text-white hover:opacity-90">
      {children}
    </Link>
  );
}
function Ghost({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href as Route} className="inline-flex items-center gap-1.5 rounded-full border border-white/30 px-5 py-2.5 text-[16px] font-medium text-white hover:bg-white/10">
      {children}
    </Link>
  );
}

export function LandingPageScenes() {
  return (
    <main className="bg-[#0A0E0C] text-white">
      <LandingSwitcher current="scenes" />

      {/* Hero — split: copy + scene image */}
      <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 pt-20 sm:pt-28 md:grid-cols-2">
        <div className="flex flex-col items-start gap-6 text-left">
          <Eyebrow>My Research Lab</Eyebrow>
          <h1 className="font-serif text-[2.5rem] font-medium leading-[1.08] tracking-[-0.01em] sm:text-[3.5rem]">
            Replicate any study in <span className="text-[var(--color-primary)]">one click</span>.
          </h1>
          <p className="max-w-xl text-[18px] leading-relaxed text-white/75">
            Start from any published study and adapt it freely. Design, preregister, recruit, run, analyze — all without
            leaving My Research Lab. Your OSF, Prolific, and AI vendor accounts connect through. One workspace.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Primary href="/signup">
              Start free <ArrowRight className="size-4" aria-hidden />
            </Primary>
            <Ghost href="/explore">Browse the library</Ghost>
          </div>
          <p className="text-[15px] text-white/55">Free for individual researchers · BYO Prolific / OSF / Anthropic / Hume · No credit card</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${S}/scene-b.png`} alt="A researcher at their desk" className="w-full rounded-[var(--radius-lg)] object-cover shadow-[var(--shadow-md)]" />
      </section>

      {/* Tired of… */}
      <section className="mx-auto mt-24 grid w-full max-w-6xl items-center gap-10 px-6 md:grid-cols-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${S}/scene-d.png`} alt="" className="order-2 w-full rounded-[var(--radius-lg)] object-cover md:order-1" />
        <div className="order-1 flex flex-col gap-6 md:order-2">
          <Eyebrow>The status quo</Eyebrow>
          <h2 className="font-serif text-[2.25rem] font-medium leading-tight sm:text-[3rem]">Tired of…</h2>
          <ul className="flex flex-col gap-3 text-[16px] text-white/75">
            {[
              "Rebuilding the same study three times across three tools just to run it once.",
              "Replicating a published study meaning rebuilding it from scratch out of the methods section.",
              "Losing track of which version your last 200 participants actually saw.",
              "Modern stimulus types (audio, voice conversation, emotion scoring) being either impossible or a hack.",
              "Paying per response just to collect data when your grant is already paying for participants.",
              "Vendor lock-in that means leaving means losing five years of study designs.",
            ].map((p) => (
              <li key={p} className="flex items-start gap-3">
                <ArrowRight className="mt-1 size-4 shrink-0 text-[var(--color-primary)]" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Workflow */}
      <section className="mx-auto w-full max-w-6xl px-6 py-24">
        <Eyebrow>End-to-end</Eyebrow>
        <h2 className="mt-3 font-serif text-[2.25rem] font-medium leading-tight sm:text-[3rem]">One tool. The whole workflow.</h2>
        <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [Lightbulb, "Playground", "Collect inspiration before a study exists"],
            [Pencil, "Design", "Drag blocks, set conditions, configure variants"],
            [Stamp, "Preregister", "One-click OSF preregistration; frozen forever"],
            [Users, "Recruit", "Connect Prolific or your own panel"],
            [PlayCircle, "Run", "Real-time response collection"],
            [BarChart3, "Analyze", "Live results, breakdowns, exports"],
            [GitFork, "Replicate", "Replicate any public study; track divergence"],
          ].map(([Icon, label, desc]) => {
            const I = Icon as typeof Lightbulb;
            return (
              <li key={label as string} className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-white/15 bg-white/5 p-5">
                <I className="size-5 text-[var(--color-primary)]" aria-hidden />
                <span className="text-[16px] font-medium">{label as string}</span>
                <span className="text-[15px] text-white/60">{desc as string}</span>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Features — each tile decorated with a scene thumbnail */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-24">
        <Eyebrow>Built for rigor</Eyebrow>
        <h2 className="mt-3 font-serif text-[2.25rem] font-medium leading-tight sm:text-[3rem]">What sets My Research Lab apart</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            [GitCommit, "Version everything", "Every save is a version. Every preregistration is frozen forever. Compare side-by-side; restore any prior state."],
            [GitFork, "One-click replication", "Bring any study into your workspace. Same blocks, same conditions — adapt freely. Authors see who's replicating."],
            [UsersRound, "Live collaboration", "See who's editing what. Comment on any block. @mention teammates. Threaded discussions stay with the study."],
            [Mic, "Modern stimuli", "46+ block types: audio recording, voice conversation with AI, emotion scoring, factorial variants, hot-spots, and more."],
            [PlugZap, "Open integrations", "OSF, Prolific, Anthropic, Hume — BYO keys, your accounts, no markup. New providers via our open adapter pattern."],
            [Eye, "Radical transparency", "Open by default. Public studies are replicable by anyone. Methodology you can audit. Source-available."],
          ].map(([Icon, title, body], idx) => {
            const I = Icon as typeof GitCommit;
            return (
              <div key={title as string} className="flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-white/15 bg-white/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${S}/${SCENES[idx % SCENES.length]}.png`} alt="" className="h-28 w-full object-cover" />
                <div className="flex flex-col gap-2 p-5">
                  <I className="size-5 text-[var(--color-primary)]" aria-hidden />
                  <h3 className="font-serif text-[18px] font-medium">{title as string}</h3>
                  <p className="text-[15px] leading-relaxed text-white/70">{body as string}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Community */}
      <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 pb-24 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Eyebrow>From the community</Eyebrow>
          <h2 className="font-serif text-[2rem] font-medium leading-tight sm:text-[2.75rem]">Real studies from real researchers</h2>
          <p className="max-w-xl text-[16px] text-white/75">
            Browse published methodologies. Replicate any of them in one click. Be among the first researchers to publish
            a study in the open My Research Lab library — your work becomes a starting point for replications.
          </p>
          <div><Ghost href="/explore">Browse all studies <ArrowRight className="size-4" aria-hidden /></Ghost></div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${S}/scene-h.png`} alt="" className="w-full rounded-[var(--radius-lg)] object-cover" />
      </section>

      {/* Trust signals */}
      <section className="border-y border-white/10 px-6 py-14">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
          {[
            [Stamp, "OSF-native", "Preregister + replicate in one click"],
            [ShieldCheck, "GDPR-aligned", "Anonymous participant IDs by default"],
            [KeyRound, "BYO API keys", "Your accounts, no markup, no lock-in"],
            [BookOpen, "Open methodology", "Every design decision documented"],
            [Puzzle, "Swap any vendor", "Auth, OSF, recruitment, AI — replaceable"],
          ].map(([Icon, label, line]) => {
            const I = Icon as typeof Stamp;
            return (
              <div key={label as string} className="flex flex-col gap-1.5">
                <I className="size-5 text-[var(--color-primary)]" aria-hidden />
                <span className="text-[16px] font-medium">{label as string}</span>
                <span className="text-[15px] text-white/60">{line as string}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Pricing */}
      <section className="mx-auto w-full max-w-5xl px-6 py-24">
        <Eyebrow>Pricing</Eyebrow>
        <h2 className="mt-3 font-serif text-[2.25rem] font-medium leading-tight sm:text-[3rem]">Pay what feels right.</h2>
        <p className="mt-3 max-w-2xl text-[16px] text-white/75">
          My Research Lab is free to use. If it helps your research, you decide what it&apos;s worth. We built this for
          science, not for subscription revenue. Pay $0 forever — that&apos;s a real option, not a trap.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            [Sprout, "Free", "$0 / forever", "For PhD students, indie researchers, anyone starting out. All features. All blocks. BYO vendor accounts."],
            [Coffee, "Supporter", "Suggested ~$9 / month", "For researchers who want to back the project. Same features as Free — the difference is moral support."],
            [TreePine, "Lab / Group", "Suggested ~$29 / month", "For labs using My Research Lab as their primary tool. Same features as Free; funds development."],
          ].map(([Icon, name, price, body]) => {
            const I = Icon as typeof Sprout;
            return (
              <div key={name as string} className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-white/15 bg-white/5 p-6">
                <I className="size-5 text-[var(--color-primary)]" aria-hidden />
                <h3 className="font-serif text-[18px] font-medium">{name as string}</h3>
                <p className="text-[16px] font-medium">{price as string}</p>
                <p className="text-[15px] text-white/65">{body as string}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Primary href="/signup">Start free</Primary>
          <Ghost href="mailto:lowcydizajnu@gmail.com?subject=My%20Research%20Lab%20partnership">Talk about a partnership</Ghost>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto flex w-full max-w-3xl flex-col items-center gap-5 px-6 py-24 text-center">
        <h2 className="font-serif text-[2.5rem] font-medium leading-tight sm:text-[3.25rem]">Ready to run better research?</h2>
        <p className="text-[16px] text-white/75">Free for individual researchers. Institutional partnerships available.</p>
        <Primary href="/signup">
          Start your first study <ArrowRight className="size-4" aria-hidden />
        </Primary>
      </section>

      <footer className="border-t border-white/10 px-6 py-10 text-center">
        <p className="text-[15px] text-white/50">© 2026 My Research Lab — built by Paweł Rosner</p>
      </footer>
    </main>
  );
}
