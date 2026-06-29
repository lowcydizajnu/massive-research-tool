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
// Deep emerald sampled from the "Tired of…" lounge illustration — the tile
// background for the bold direction (owner: "use green … as a background").
const TILE_GREEN = "#176848";

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

      {/* Hero — full-bleed 3D scene (Figma node 2:19); left-aligned text. */}
      <section className="relative isolate flex min-h-[88vh] items-center px-6 py-24 sm:px-12">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${IMG}/hero.png`} alt="" className="absolute inset-0 -z-10 size-full object-cover" />
        {/* Even full-bleed dim (was a left-weighted gradient that read unbalanced). */}
        <div className="absolute inset-0 -z-10 bg-black/60" aria-hidden />
        <div className="flex max-w-2xl flex-col items-start gap-6 text-left">
          <h1 className="font-serif text-[2.75rem] font-bold leading-[1.05] tracking-[-0.01em] text-white sm:text-[4.5rem]">
            Replicate any study in one click.
          </h1>
          <p className="max-w-xl text-[length:var(--text-body)] leading-relaxed text-white/85 sm:text-[18px]">
            Start from any published study and adapt it freely. Design, preregister, recruit, run, analyze — all without
            leaving My Research Lab. Your OSF, Prolific, and AI vendor accounts connect through. One workspace.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Pill href="/signup">
              Start free <ArrowRight className="size-4" aria-hidden />
            </Pill>
            <Link href={"/explore" as Route} className="rounded-full border border-white/40 px-6 py-3 text-[length:var(--text-body)] font-medium text-white hover:bg-white/10">
              Browse the library
            </Link>
          </div>
          <p className="text-[length:var(--text-small)] text-white/70">
            Free for individual researchers · BYO Prolific / OSF / Anthropic / Hume · No credit card
          </p>
        </div>
      </section>

      {/* Tired of… — pain points beside the lounging figure */}
      <section className="bg-[#0A0E0C] px-6 py-24">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 md:grid-cols-2">
          <div className="flex flex-col gap-6">
            <h2 className="font-serif text-[3rem] font-bold leading-none text-white sm:text-[5rem]">Tired of…</h2>
            <ul className="flex flex-col gap-3 text-[length:var(--text-body)] text-white/80">
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${IMG}/orange-lounge.png`} alt="A researcher taking a break" className="mx-auto w-full max-w-md rounded-[var(--radius-lg)] object-contain" />
        </div>
      </section>

      {/* Workflow */}
      <section className="bg-[#0A0E0C] px-6 py-24">
        <div className="mx-auto w-full max-w-6xl">
          <h2 className="font-serif text-[2.25rem] font-bold leading-tight text-white sm:text-[3.25rem]">One tool. The whole workflow.</h2>
          <p className="mt-3 max-w-2xl text-[17px] text-white/75">
            No more juggling six tools. My Research Lab covers the full research lifecycle in one workspace — with version
            control under every step.
          </p>
          <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [Lightbulb, "Playground", "Collect inspiration, links, drafts before a study exists"],
              [Pencil, "Design", "Drag blocks, set conditions, configure variants"],
              [Stamp, "Preregister", "One-click OSF preregistration; frozen version forever"],
              [Users, "Recruit", "Connect Prolific or open recruitment to your own panel"],
              [PlayCircle, "Run", "Participants take the study; real-time response collection"],
              [BarChart3, "Analyze", "Live results, condition breakdowns, exports in any format"],
              [GitFork, "Replicate", "Replicate any public study; track divergence from the original"],
            ].map(([Icon, label, desc]) => {
              const I = Icon as typeof Lightbulb;
              return (
                <li key={label as string} className="flex flex-col gap-2 rounded-[var(--radius-lg)] p-5" style={{ backgroundColor: TILE_GREEN }}>
                  <I className="size-5 text-white" aria-hidden />
                  <span className="text-[17px] font-medium text-white">{label as string}</span>
                  <span className="text-[15px] text-white/75">{desc as string}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* Features */}
      <section className="bg-[var(--color-surface-canvas)] px-6 py-24">
        <div className="mx-auto w-full max-w-6xl">
          <h2 className="font-serif text-[2.25rem] font-bold leading-tight text-[var(--color-text-primary)] sm:text-[3.25rem]">What sets My Research Lab apart</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              [GitCommit, "Version everything", "Every save is a version. Every preregistration is frozen forever. Compare versions side-by-side. Restore any prior state. Your changelog writes itself."],
              [GitFork, "One-click replication", "Found a study you want to replicate? Bring it into your workspace. Same blocks, same conditions — adapt freely. Original authors see who's replicating their work."],
              [UsersRound, "Live collaboration", "See who's editing what. Comment on any block. @mention teammates. Soft-lock prevents accidental conflicts. Threaded discussions stay with the study."],
              [Mic, "Modern stimuli", "46+ block types: text, image, audio recording, voice conversation with AI, emotion scoring, A/B factorial variants, social-media-post mockups, signature capture, hot-spot interactions."],
              [PlugZap, "Open integrations", "OSF preregistration. Prolific recruitment. Anthropic Claude. Hume emotion AI. BYO keys — your data, your accounts, no markup. Add new providers via our open adapter pattern."],
              [Eye, "Radical transparency", "Open by default. Public studies are replicable by anyone. Your workflow is visible to your team. Methodology you can audit. Source-available; commercial-friendly."],
            ].map(([Icon, title, body]) => {
              const I = Icon as typeof GitCommit;
              return (
                <div key={title as string} className="flex flex-col gap-2 rounded-[var(--radius-lg)] p-5" style={{ backgroundColor: TILE_GREEN }}>
                  <I className="size-5 text-white" aria-hidden />
                  <h3 className="font-serif text-[19px] font-bold text-white">{title as string}</h3>
                  <p className="text-[15px] leading-relaxed text-white/80">{body as string}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Trust signals */}
      <section className="bg-[#0A0E0C] px-6 py-16">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
          {[
            [Stamp, "OSF-native", "Preregister + replicate in one click"],
            [ShieldCheck, "GDPR-aligned", "Anonymous participant IDs by default"],
            [KeyRound, "BYO API keys", "Your vendor accounts, no markup, no lock-in"],
            [BookOpen, "Open methodology", "Every design decision documented"],
            [Puzzle, "Swap any vendor", "Auth, OSF, recruitment, AI — all replaceable"],
          ].map(([Icon, label, line]) => {
            const I = Icon as typeof Stamp;
            return (
              <div key={label as string} className="flex flex-col gap-1.5">
                <I className="size-5 text-[var(--color-primary)]" aria-hidden />
                <span className="text-[16px] font-medium text-white">{label as string}</span>
                <span className="text-[15px] text-white/60">{line as string}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Comparison */}
      <section className="bg-[var(--color-surface-canvas)] px-6 py-24">
        <div className="mx-auto w-full max-w-5xl">
          <h2 className="font-serif text-[2.25rem] font-bold leading-tight text-[var(--color-text-primary)] sm:text-[3rem]">Replace six tools with one workspace.</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--color-surface-subtle)] p-6">
              <p className="text-[16px] font-medium text-[var(--color-text-secondary)]">Before My Research Lab</p>
              <ul className="flex flex-col gap-2 text-[15px] text-[var(--color-text-muted)]">
                {["A survey tool — building the study ($$$/yr seat license)", "OSF — preregistration (free but disconnected)", "Prolific — recruitment (pass-through, but you re-key everything)", "Word doc — methodology notes", "Spreadsheets — tracking which version ran when", "Email threads — collaboration"].map((b) => (
                  <li key={b}>— {b}</li>
                ))}
              </ul>
              <p className="mt-1 text-[15px] text-[var(--color-text-muted)]">≈ $2,000–15,000 per researcher per year.</p>
            </div>
            <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border-2 border-[var(--color-primary)] bg-[var(--color-surface-canvas)] p-6">
              <p className="text-[16px] font-medium text-[var(--color-primary-text-on-subtle)]">With My Research Lab</p>
              <ul className="flex flex-col gap-2 text-[15px] text-[var(--color-text-primary)]">
                {["One workspace: design + preregistration + recruitment + collaboration + version history + replication", "One subscription — free for individuals; pay what feels right above that", "BYO Prolific / AI vendor costs — no markup"].map((a) => (
                  <li key={a} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-[var(--color-primary-text-on-subtle)]" aria-hidden />
                    {a}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[15px] font-medium text-[var(--color-text-primary)]">Free for individual researchers.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="bg-[#0A0E0C] px-6 py-24">
        <div className="mx-auto w-full max-w-5xl">
          <h2 className="font-serif text-[2.25rem] font-bold leading-tight text-white sm:text-[3.25rem]">Pay what feels right.</h2>
          <p className="mt-3 max-w-2xl text-[17px] text-white/75">
            My Research Lab is free to use. If it helps your research, you decide what it&apos;s worth. We built this for
            science, not for subscription revenue. Pay $0 forever — that&apos;s a real option, not a trap.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              [Sprout, "Free", "$0 / forever", "For PhD students, indie researchers, anyone just starting out. All features. All blocks. BYO vendor accounts."],
              [Coffee, "Supporter", "Suggested ~$9 / month", "For researchers who want to back the project. Same features as Free — the difference is moral support."],
              [TreePine, "Lab / Group", "Suggested ~$29 / month", "For labs using My Research Lab as their primary tool. Same features as Free; funds larger development cycles."],
            ].map(([Icon, name, price, body]) => {
              const I = Icon as typeof Sprout;
              return (
                <div key={name as string} className="flex flex-col gap-2 rounded-[var(--radius-lg)] p-6" style={{ backgroundColor: TILE_GREEN }}>
                  <I className="size-5 text-white" aria-hidden />
                  <h3 className="font-serif text-[19px] font-bold text-white">{name as string}</h3>
                  <p className="text-[16px] font-medium text-white">{price as string}</p>
                  <p className="text-[15px] text-white/80">{body as string}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-[15px] text-white/55">No tier is locked. No paywall. Pay what your budget allows. Cancel anytime.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Pill href="/signup">Start free</Pill>
            <Link href={"mailto:lowcydizajnu@gmail.com?subject=My%20Research%20Lab%20partnership" as Route} className="rounded-full border border-white/40 px-6 py-3 text-[length:var(--text-body)] font-medium text-white hover:bg-white/10">
              Talk about a partnership
            </Link>
          </div>
        </div>
      </section>

      {/* Audiences */}
      <section className="bg-[var(--color-surface-canvas)] px-6 py-24">
        <div className="mx-auto grid w-full max-w-5xl gap-6 md:grid-cols-2">
          {[
            {
              eyebrow: "For PhD students + postdocs",
              h: "Designed for the way you actually work",
              items: ["Build complex studies without writing a line of code", "Replicate any published methodology in one click", "Comment with your advisor on specific blocks", "Save versions before every meeting; restore anytime", "Free forever; bring your own Prolific account", "Export in CSV / SPSS / R-friendly formats"],
              cta: "Start your first study",
            },
            {
              eyebrow: "For PIs + lab directors",
              h: "Built for the standards you uphold",
              items: ["Preregistration is the default, not an afterthought", "Every study version is frozen + cited individually", "Cross-workspace replications visible from your study page", "Audit trail for every change — IRB-ready", "Adapter architecture: never locked into a vendor", "Pay what feels right at lab level; partnerships available"],
              cta: "Start your lab",
            },
          ].map((col) => (
            <div key={col.h} className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-6">
              <span className="text-[length:var(--text-label)] font-medium uppercase tracking-wide text-[var(--color-primary-text-on-subtle)]">{col.eyebrow}</span>
              <h3 className="font-serif text-[22px] font-bold text-[var(--color-text-primary)]">{col.h}</h3>
              <ul className="flex flex-col gap-2">
                {col.items.map((i) => (
                  <li key={i} className="flex items-start gap-2 text-[15px] text-[var(--color-text-secondary)]">
                    <Check className="mt-0.5 size-4 shrink-0 text-[var(--color-primary-text-on-subtle)]" aria-hidden />
                    {i}
                  </li>
                ))}
              </ul>
              <div className="pt-1">
                <Pill href="/signup" dark>
                  {col.cta} <ArrowRight className="size-4" aria-hidden />
                </Pill>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Community — moved down (owner); scattered figures */}
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
            {["fig1", "fig2", "astronaut", "fig3", "fig4"].map((f) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={f} src={`${IMG}/${f}.png`} alt="" className="h-44 w-auto object-contain sm:h-56" />
            ))}
          </div>
          <Pill href="/explore" dark>
            Browse all studies <ArrowRight className="size-4" aria-hidden />
          </Pill>
        </div>
      </section>

      {/* Relax. Take your (work)space. — emotional dark beat (Figma headline kept) */}
      <section className="relative isolate flex min-h-[70vh] items-center justify-center px-6 py-24 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${IMG}/room.png`} alt="" className="absolute inset-0 -z-10 size-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-black/55" aria-hidden />
        <div className="flex max-w-3xl flex-col items-center gap-6">
          <h2 className="font-serif text-[2.75rem] font-bold leading-[1.05] text-white sm:text-[4.5rem]">
            Relax. Take your (work)space.
          </h2>
          <p className="max-w-xl text-[length:var(--text-body)] text-white/85">
            Free for individual researchers. Pay what feels right above that. No per-response fees, no lock-in.
          </p>
          <Pill href="/signup">Sign up</Pill>
        </div>
      </section>

      <footer className="border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-6 py-10 text-center">
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">© 2026 My Research Lab — built by Paweł Rosner</p>
      </footer>
    </main>
  );
}
