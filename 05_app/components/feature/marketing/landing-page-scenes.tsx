import Link from "next/link";
import type { Route } from "next";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  Coffee,
  GitFork,
  KeyRound,
  Lightbulb,
  Pencil,
  PlayCircle,
  Puzzle,
  ShieldCheck,
  Sprout,
  Stamp,
  TreePine,
  Users,
} from "lucide-react";

import { LandingSwitcher } from "@/components/feature/marketing/landing-switcher";
import { VideoRelax } from "@/components/feature/marketing/video-relax";

/**
 * Landing proposal C — "Scenes": Minimal's content + copy, in an illustration-
 * driven design language pulled from the Figma board (node 7:67). DELIBERATELY
 * NOT token-compliant (owner direction) — it uses a custom palette sampled from
 * the 3D renders (deep cobalt, orange, green) so the page reads as one world
 * with the illustrations. Hero = robot/child-hand render; the Modern-stimuli
 * tile uses the tools render; "Real studies" moved down near the end. Assets in
 * /public/marketing/figma/scenes/. Plain <img> (proposal-only).
 */
const S = "/marketing/figma/scenes";
// Palette sampled from the renders (free of design tokens, per owner).
const NAVY = "#102444";
const NAVY2 = "#0c1c38";
const ORANGE = "#E2692E";
const GREEN = "#2F7A57";
const BLUE = "#2B5FA6";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[length:var(--text-label)] font-medium uppercase tracking-[0.14em]" style={{ color: ORANGE }}>
      {children}
    </p>
  );
}
function Primary({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href as Route} className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[16px] font-medium text-white hover:opacity-90" style={{ backgroundColor: ORANGE }}>
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
    <main className="text-white" style={{ backgroundColor: NAVY }}>
      <LandingSwitcher current="scenes" />

      {/* Hero — robot/child-hand render */}
      <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 pt-20 sm:pt-28 md:grid-cols-2">
        <div className="flex flex-col items-start gap-6 text-left">
          <Eyebrow>My Research Lab</Eyebrow>
          <h1 className="font-serif text-[2.5rem] font-medium leading-[1.08] tracking-[-0.01em] sm:text-[3.5rem]">
            Replicate any study in <span style={{ color: ORANGE }}>one click</span>.
          </h1>
          <p className="max-w-xl text-[18px] leading-relaxed text-white/80">
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
        <img src={`${S}/hand-cube.png`} alt="A robotic and a human hand exchanging a block" className="w-full rounded-[20px] object-cover shadow-2xl" />
      </section>

      {/* Tired of… */}
      <section className="mx-auto mt-24 grid w-full max-w-6xl items-center gap-10 px-6 md:grid-cols-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${S}/robot-standing.png`} alt="" className="order-2 w-full rounded-[20px] object-cover md:order-1" />
        <div className="order-1 flex flex-col gap-6 md:order-2">
          <Eyebrow>The status quo</Eyebrow>
          <h2 className="font-serif text-[2.25rem] font-medium leading-tight sm:text-[3rem]">Tired of…</h2>
          <ul className="flex flex-col gap-3 text-[16px] text-white/80">
            {[
              "Rebuilding the same study three times across three tools just to run it once.",
              "Replicating a published study meaning rebuilding it from scratch out of the methods section.",
              "Losing track of which version your last 200 participants actually saw.",
              "Modern stimulus types (audio, voice conversation, emotion scoring) being either impossible or a hack.",
              "Paying per response just to collect data when your grant is already paying for participants.",
              "Vendor lock-in that means leaving means losing five years of study designs.",
            ].map((p) => (
              <li key={p} className="flex items-start gap-3">
                <ArrowRight className="mt-1 size-4 shrink-0" style={{ color: ORANGE }} aria-hidden />
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
              <li key={label as string} className="flex flex-col gap-2 rounded-[16px] p-5" style={{ backgroundColor: NAVY2 }}>
                <I className="size-5" style={{ color: ORANGE }} aria-hidden />
                <span className="text-[16px] font-medium">{label as string}</span>
                <span className="text-[15px] text-white/60">{desc as string}</span>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Features — colored tiles; stimuli tile shows the tools render */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-24">
        <Eyebrow>Built for rigor</Eyebrow>
        <h2 className="mt-3 font-serif text-[2.25rem] font-medium leading-tight sm:text-[3rem]">What sets My Research Lab apart</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Version everything", "Every save is a version. Every preregistration is frozen forever. Compare side-by-side; restore any prior state.", GREEN, "lab-desks"],
            ["One-click replication", "Bring any study into your workspace — same blocks, same conditions — and adapt freely. Original authors are credited once your replication is public.", BLUE, "silhouette-screen"],
            ["Live collaboration", "See who's editing what. Comment on any block. @mention teammates. Threaded discussions stay with the study.", ORANGE, "people-desk"],
            ["Modern stimuli", "46+ block types: audio recording, voice conversation with AI, emotion scoring, factorial variants, hot-spots, and more.", GREEN, "tools"],
            ["Open integrations", "OSF, Prolific, Anthropic, Hume — BYO keys, your accounts, no markup. New providers via our open adapter pattern.", BLUE, "robot-desk"],
            ["Make it your own", "Start from a template or build your own blocks. Adapt any study to your protocol — your wording, your conditions — and save it as a reusable template for your lab.", ORANGE, "gallery"],
          ].map(([title, body, color, img]) => (
            <div key={title} className="flex flex-col overflow-hidden rounded-[16px]" style={{ backgroundColor: color }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${S}/${img}.png`} alt="" className="h-44 w-full object-cover" />
              <div className="flex flex-col gap-2 p-6">
                <h3 className="font-serif text-[19px] font-medium text-white">{title}</h3>
                <p className="text-[15px] leading-relaxed text-white/85">{body}</p>
              </div>
            </div>
          ))}
        </div>
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
                <I className="size-5" style={{ color: ORANGE }} aria-hidden />
                <span className="text-[16px] font-medium">{label as string}</span>
                <span className="text-[15px] text-white/60">{line as string}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Comparison */}
      <section className="mx-auto w-full max-w-5xl px-6 py-24">
        <Eyebrow>Before / after</Eyebrow>
        <h2 className="mt-3 font-serif text-[2.25rem] font-medium leading-tight sm:text-[3rem]">Replace six tools with one workspace.</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-[16px] p-6" style={{ backgroundColor: NAVY2 }}>
            <p className="text-[16px] font-medium text-white/70">Before My Research Lab</p>
            <ul className="flex flex-col gap-2 text-[15px] text-white/55">
              {["A survey tool — building the study ($$$/yr seat license)", "OSF — preregistration (free but disconnected)", "Prolific — recruitment (pass-through, but you re-key everything)", "Word doc — methodology notes", "Spreadsheets — tracking which version ran when", "Email threads — collaboration"].map((b) => (
                <li key={b}>— {b}</li>
              ))}
            </ul>
            <p className="mt-1 text-[15px] text-white/55">≈ $2,000–15,000 per researcher per year.</p>
          </div>
          <div className="flex flex-col gap-3 rounded-[16px] p-6" style={{ backgroundColor: GREEN }}>
            <p className="text-[16px] font-medium text-white">With My Research Lab</p>
            <ul className="flex flex-col gap-2 text-[15px] text-white">
              {["One workspace: design + preregistration + recruitment + collaboration + version history + replication", "One subscription — free for individuals; pay what feels right above that", "BYO Prolific / AI vendor costs — no markup"].map((a) => (
                <li key={a} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {a}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[15px] font-medium text-white">Free for individual researchers.</p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="mx-auto w-full max-w-5xl px-6 pb-24">
        <Eyebrow>Pricing</Eyebrow>
        <h2 className="mt-3 font-serif text-[2.25rem] font-medium leading-tight sm:text-[3rem]">Pay what feels right.</h2>
        <p className="mt-3 max-w-2xl text-[16px] text-white/75">
          My Research Lab is free to use. If it helps your research, you decide what it&apos;s worth. We built this for
          science, not for subscription revenue. Pay $0 forever — that&apos;s a real option, not a trap.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            [Sprout, "Free", "$0 / forever", "For PhD students, indie researchers, anyone starting out. All features. All blocks. BYO vendor accounts.", GREEN],
            [Coffee, "Supporter", "Suggested ~$9 / month", "For researchers who want to back the project. Same features as Free — the difference is moral support.", BLUE],
            [TreePine, "Lab / Group", "Suggested ~$29 / month", "For labs using My Research Lab as their primary tool. Same features as Free; funds development.", ORANGE],
          ].map(([Icon, name, price, body, color]) => {
            const I = Icon as typeof Sprout;
            return (
              <div key={name as string} className="flex flex-col gap-2 rounded-[16px] p-6" style={{ backgroundColor: color as string }}>
                <I className="size-5 text-white" aria-hidden />
                <h3 className="font-serif text-[19px] font-medium text-white">{name as string}</h3>
                <p className="text-[16px] font-medium text-white">{price as string}</p>
                <p className="text-[15px] text-white/85">{body as string}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Primary href="/signup">Start free</Primary>
          <Ghost href="mailto:lowcydizajnu@gmail.com?subject=My%20Research%20Lab%20partnership">Talk about a partnership</Ghost>
        </div>
      </section>

      {/* Audiences */}
      <section className="mx-auto grid w-full max-w-5xl gap-6 px-6 pb-24 md:grid-cols-2">
        {[
          { eyebrow: "For PhD students + postdocs", h: "Designed for the way you actually work", items: ["Build complex studies without writing code", "Replicate any methodology in one click", "Comment with your advisor on specific blocks", "Save versions before every meeting", "Free forever; bring your own Prolific account", "Export in CSV / SPSS / R-friendly formats"], cta: "Start your first study" },
          { eyebrow: "For PIs + lab directors", h: "Built for the standards you uphold", items: ["Preregistration is the default", "Every study version frozen + cited", "Cross-workspace replications visible", "Audit trail for every change — IRB-ready", "Adapter architecture: never locked in", "Pay what feels right; partnerships available"], cta: "Start your lab" },
        ].map((col) => (
          <div key={col.h} className="flex flex-col gap-3 rounded-[16px] p-6" style={{ backgroundColor: NAVY2 }}>
            <Eyebrow>{col.eyebrow}</Eyebrow>
            <h3 className="font-serif text-[22px] font-medium">{col.h}</h3>
            <ul className="flex flex-col gap-2">
              {col.items.map((i) => (
                <li key={i} className="flex items-start gap-2 text-[15px] text-white/80">
                  <Check className="mt-0.5 size-4 shrink-0" style={{ color: ORANGE }} aria-hidden />
                  {i}
                </li>
              ))}
            </ul>
            <div className="pt-1">
              <Primary href="/signup">
                {col.cta} <ArrowRight className="size-4" aria-hidden />
              </Primary>
            </div>
          </div>
        ))}
      </section>

      {/* Real studies — MOVED DOWN (owner) — near the end */}
      <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 pb-24 md:grid-cols-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${S}/horizon-road.png`} alt="" className="w-full rounded-[20px] object-cover" />
        <div className="flex flex-col gap-4">
          <Eyebrow>From the community</Eyebrow>
          <h2 className="font-serif text-[2rem] font-medium leading-tight sm:text-[2.75rem]">Real studies from real researchers</h2>
          <p className="max-w-xl text-[16px] text-white/75">
            Browse published methodologies. Replicate any of them in one click. Be among the first researchers to publish
            a study in the open My Research Lab library — your work becomes a starting point for replications.
          </p>
          <div><Ghost href="/explore">Browse all studies <ArrowRight className="size-4" aria-hidden /></Ghost></div>
        </div>
      </section>

      {/* Closing video beat — plays when ≥50% on screen (owner) */}
      <VideoRelax src="/marketing/relax.mp4" heading="Relax. Take your (work)space." />

      <footer className="border-t border-white/10 px-6 py-10 text-center">
        <p className="text-[15px] text-white/50">© 2026 My Research Lab — built by Paweł Rosner</p>
      </footer>
    </main>
  );
}
