import Link from "next/link";
import type { Route } from "next";
import { LandingSwitcher } from "@/components/feature/marketing/landing-switcher";
import { LandingNav } from "@/components/feature/marketing/landing-nav";
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

/**
 * Public marketing landing for myresearchlab.app (logged-out visitors).
 * Content + structure per `00_meta/business-development/landing-page-content.md`;
 * v0.7 design language (warm-white + emerald + Plex Serif) via tokens only — no
 * raw hex. Static (server component) for SSG + perf. Headline locked to the
 * replication-first hero; "Qualtrics" genericized to "a survey tool" (legal
 * safety per the doc); OSF/Prolific/Anthropic/Hume named as real integrations.
 */

const SERIF = "font-serif text-[var(--color-text-primary)]";
const EYEBROW =
  "text-[length:var(--text-label)] font-medium uppercase tracking-[0.12em] text-[var(--color-primary-text-on-subtle)]";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className={EYEBROW}>
      <span className="mr-1.5 inline-block size-1.5 rounded-full bg-[var(--color-primary)]" aria-hidden />
      {children}
    </p>
  );
}

function PrimaryCta({ href, children, large }: { href: string; children: React.ReactNode; large?: boolean }) {
  return (
    <Link
      href={href as Route}
      className={`inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-primary)] font-medium text-white hover:opacity-90 ${large ? "px-6 py-3 text-[16px]" : "px-4 py-2 text-[length:var(--text-body-emphasis)]"}`}
    >
      {children}
    </Link>
  );
}

function GhostCta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href as Route}
      className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-4 py-2 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
    >
      {children}
    </Link>
  );
}

/* ---------------- 1. Hero ---------------- */
function Hero() {
  return (
    <section className="relative mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-6 pt-20 text-left sm:pt-28">
      <Eyebrow>My Research Lab</Eyebrow>
      <h1 className={`${SERIF} max-w-3xl text-[2rem] font-medium leading-[1.1] tracking-[-0.01em] sm:text-[3.25rem]`}>
        Replicate any study in <span className="text-[var(--color-primary-text-on-subtle)]">one click</span>.
      </h1>
      <p className="max-w-2xl text-[17px] leading-relaxed text-[var(--color-text-secondary)] sm:text-[20px]">
        Start from any published study and adapt it freely. Design, preregister, recruit, run, analyze —{" "}
        <span className="font-medium text-[var(--color-text-primary)]">all without leaving My Research Lab.</span> Your
        survey builder and version history live here. Your OSF, Prolific, and AI vendor accounts connect through. One
        workspace.
      </p>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <PrimaryCta href="/signup">
          Start free <ArrowRight className="size-4" aria-hidden />
        </PrimaryCta>
        <GhostCta href="/explore">
          <PlayCircle className="size-4" aria-hidden /> Browse the library
        </GhostCta>
      </div>
      <p className="text-[15px] text-[var(--color-text-muted)]">
        Free for individual researchers · BYO Prolific / OSF / Anthropic / Hume · No credit card
      </p>
    </section>
  );
}

/* ---------------- 2. Pain points (dark) ---------------- */
const PAINS = [
  ["Rebuilding the same study", " three times across three tools just to run it once."],
  ["Replicating a published study", " meaning rebuilding it from scratch out of the methods section."],
  ["Losing track of which version", " your last 200 participants actually saw."],
  ["Modern stimulus types", " (audio, voice conversation, emotion scoring) being either impossible or a hack."],
  ["Paying per response", " just to collect data when your grant is already paying for participants."],
  ["Vendor lock-in", " that means leaving means losing five years of study designs."],
] as const;

function PainPoints() {
  return (
    <section className="mt-20" data-theme="dark">
      <div className="bg-[var(--color-surface-page)] py-20">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 md:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-3">
              <Eyebrow>The status quo</Eyebrow>
              <h2 className={`${SERIF} text-[length:var(--text-display)] font-medium`}>Tired of…</h2>
            </div>
            <ul className="flex flex-col gap-4">
              {PAINS.map(([lead, rest]) => (
                <li key={lead} className="flex items-start gap-3 text-[16px] text-[var(--color-text-secondary)] sm:text-[17px]">
                  <ArrowRight className="mt-1 size-4 shrink-0 text-[var(--color-primary)]" aria-hidden />
                  <span>
                    <span className="font-medium text-[var(--color-text-primary)]">{lead}</span>
                    {rest}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marketing/figma/orange-lounge.png" alt="A researcher taking a break" className="mx-auto hidden w-full max-w-xs select-none object-contain md:block" />
        </div>
      </div>
    </section>
  );
}

/* ---------------- 3. Workflow ---------------- */
const STAGES = [
  { icon: Lightbulb, label: "Playground", desc: "Collect inspiration, links, drafts before a study exists" },
  { icon: Pencil, label: "Design", desc: "Drag blocks, set conditions, configure variants" },
  { icon: Stamp, label: "Preregister", desc: "One-click OSF preregistration; frozen version forever" },
  { icon: Users, label: "Recruit", desc: "Connect Prolific or open recruitment to your own panel" },
  { icon: PlayCircle, label: "Run", desc: "Participants take the study; real-time response collection" },
  { icon: BarChart3, label: "Analyze", desc: "Live results, condition breakdowns, exports in any format" },
  { icon: GitFork, label: "Replicate", desc: "Replicate any public study; track divergence from the original" },
];

function Workflow() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-20">
      <div className="flex flex-col gap-3">
        <Eyebrow>End-to-end</Eyebrow>
        <h2 className={`${SERIF} text-[length:var(--text-display)] font-medium`}>One tool. The whole workflow.</h2>
        <p className="max-w-2xl text-[16px] text-[var(--color-text-secondary)]">
          No more juggling six tools. My Research Lab covers the full research lifecycle in one workspace — with version
          control under every step.
        </p>
      </div>
      <ol className="mt-8 flex gap-3 overflow-x-auto pb-3 sm:grid sm:grid-cols-4 sm:overflow-visible lg:grid-cols-7">
        {STAGES.map((s) => (
          <li
            key={s.label}
            className="flex min-w-[150px] flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4"
          >
            <s.icon className="size-5 text-[var(--color-primary-text-on-subtle)]" aria-hidden />
            <span className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">{s.label}</span>
            <span className="text-[15px] text-[var(--color-text-muted)]">{s.desc}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-[15px] italic text-[var(--color-text-muted)]">
        Every step versioned. Every change tracked. Every study replicable.
      </p>
    </section>
  );
}

/* ---------------- 4. Features ---------------- */
const FEATURES = [
  { icon: GitCommit, title: "Version everything", body: "Every save is a version. Every preregistration is frozen forever. Compare versions side-by-side. Restore any prior state. Your changelog writes itself." },
  { icon: GitFork, title: "One-click replication", body: "Found a study you want to replicate? Bring it into your workspace. Same blocks, same conditions — adapt freely. Original authors are credited once your replication is public." },
  { icon: UsersRound, title: "Live collaboration", body: "See who's editing what. Comment on any block. @mention teammates. Soft-lock prevents accidental conflicts. Threaded discussions stay with the study." },
  { icon: Mic, title: "Modern stimuli", body: "46+ block types: text, image, audio recording, voice conversation with AI, emotion scoring, A/B factorial variants, social-media-post mockups, signature capture, hot-spot interactions." },
  { icon: PlugZap, title: "Open integrations", body: "OSF preregistration. Prolific recruitment. Anthropic Claude. Hume emotion AI. BYO keys — your data, your accounts, no markup. Add new providers via our open adapter pattern." },
  { icon: Eye, title: "Radical transparency", body: "Open by default. Public studies are replicable by anyone. Your workflow is visible to your team. Methodology you can audit. Source-available; commercial-friendly." },
];

function Features() {
  return (
    <section className="bg-[var(--color-surface-subtle)] py-20">
      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="flex flex-col gap-3">
          <Eyebrow>Built for rigor</Eyebrow>
          <h2 className={`${SERIF} text-[length:var(--text-display)] font-medium`}>What sets My Research Lab apart</h2>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-5">
              <f.icon className="size-5 text-[var(--color-primary-text-on-subtle)]" aria-hidden />
              <h3 className="text-[17px] font-medium text-[var(--color-text-primary)] font-serif">{f.title}</h3>
              <p className="text-[15px] leading-relaxed text-[var(--color-text-secondary)]">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- 5. Community tease ---------------- */
function Community() {
  return (
    <section className="relative mx-auto w-full max-w-4xl px-6 py-20 text-center">
      <div className="flex flex-col items-center gap-3">
        <Eyebrow>From the community</Eyebrow>
        <h2 className={`${SERIF} text-[length:var(--text-heading-1)] font-medium`}>Real studies from real researchers</h2>
        <p className="max-w-2xl text-[16px] text-[var(--color-text-secondary)]">
          Browse published methodologies. Replicate any of them in one click. Be among the first researchers to publish a
          study in the open My Research Lab library — your work becomes a starting point for replications.
        </p>
        <div className="pt-2">
          <GhostCta href="/explore">
            Browse all studies <ArrowRight className="size-4" aria-hidden />
          </GhostCta>
        </div>
      </div>
    </section>
  );
}

/* ---------------- 6. Trust signals ---------------- */
const TRUST = [
  { icon: Stamp, label: "OSF-native", line: "Preregister + replicate in one click" },
  { icon: ShieldCheck, label: "GDPR-aligned", line: "Anonymous participant IDs by default" },
  { icon: KeyRound, label: "BYO API keys", line: "Your vendor accounts, no markup, no lock-in" },
  { icon: BookOpen, label: "Open methodology", line: "Every design decision documented" },
  { icon: Puzzle, label: "Swap any vendor", line: "Auth, OSF, recruitment, AI — all replaceable" },
];

function TrustSignals() {
  return (
    <section className="border-y border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] py-12">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-6 px-6 sm:grid-cols-3 lg:grid-cols-5">
        {TRUST.map((t) => (
          <div key={t.label} className="flex flex-col gap-1.5">
            <t.icon className="size-5 text-[var(--color-primary-text-on-subtle)]" aria-hidden />
            <span className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">{t.label}</span>
            <span className="text-[15px] text-[var(--color-text-muted)]">{t.line}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- 7. Comparison ---------------- */
function Comparison() {
  const before = [
    "A survey tool — building the study ($$$/yr seat license)",
    "OSF — preregistration (free but disconnected)",
    "Prolific — recruitment (pass-through, but you re-key everything)",
    "Word doc — methodology notes",
    "Spreadsheets — tracking which version ran when",
    "Email threads — collaboration",
  ];
  const after = [
    "One workspace: design + preregistration + recruitment + collaboration + version history + replication",
    "One subscription — free for individuals; pay what feels right above that",
    "BYO Prolific / AI vendor costs — no markup",
  ];
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-20">
      <div className="flex flex-col gap-3">
        <Eyebrow>Before / after</Eyebrow>
        <h2 className={`${SERIF} text-[length:var(--text-heading-1)] font-medium`}>Replace six tools with one workspace.</h2>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--color-surface-subtle)] p-6">
          <p className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-secondary)]">Before My Research Lab</p>
          <ul className="flex flex-col gap-2">
            {before.map((b) => (
              <li key={b} className="text-[15px] text-[var(--color-text-muted)]">— {b}</li>
            ))}
          </ul>
          <p className="mt-1 text-[15px] text-[var(--color-text-muted)]">≈ $2,000–15,000 per researcher per year.</p>
        </div>
        <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border-2 border-[var(--color-primary)] bg-[var(--color-surface-canvas)] p-6">
          <p className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-primary-text-on-subtle)]">With My Research Lab</p>
          <ul className="flex flex-col gap-2">
            {after.map((a) => (
              <li key={a} className="flex items-start gap-2 text-[15px] text-[var(--color-text-primary)]">
                <Check className="mt-0.5 size-4 shrink-0 text-[var(--color-primary-text-on-subtle)]" aria-hidden />
                {a}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[15px] font-medium text-[var(--color-text-primary)]">Free for individual researchers.</p>
        </div>
      </div>
    </section>
  );
}

/* ---------------- 8. Pricing ---------------- */
const TIERS = [
  { icon: Sprout, name: "Free", price: "$0 / forever", who: "For PhD students, indie researchers, anyone just starting out.", note: "All features. All blocks. BYO vendor accounts." },
  { icon: Coffee, name: "Supporter", price: "Suggested ~$9 / month", who: "For researchers who want to back the project.", note: "Same features as Free. The difference is moral support." },
  { icon: TreePine, name: "Lab / Group", price: "Suggested ~$29 / month", who: "For labs using My Research Lab as their primary tool.", note: "Same features as Free. Helps fund larger development cycles." },
];

function Pricing() {
  return (
    <section className="bg-[var(--color-surface-subtle)] py-20">
      <div className="mx-auto w-full max-w-5xl px-6">
        <div className="flex flex-col gap-3">
          <Eyebrow>Pricing</Eyebrow>
          <h2 className={`${SERIF} text-[length:var(--text-display)] font-medium`}>Pay what feels right.</h2>
          <p className="max-w-2xl text-[16px] text-[var(--color-text-secondary)]">
            My Research Lab is free to use. If it helps your research, you decide what it&apos;s worth. We built this for
            science, not for subscription revenue. Pay $0 forever — that&apos;s a real option, not a trap.
          </p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {TIERS.map((t) => (
            <div key={t.name} className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
              <t.icon className="size-5 text-[var(--color-primary-text-on-subtle)]" aria-hidden />
              <h3 className="text-[17px] font-medium text-[var(--color-text-primary)] font-serif">{t.name}</h3>
              <p className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">{t.price}</p>
              <p className="text-[15px] text-[var(--color-text-secondary)]">{t.who}</p>
              <p className="text-[15px] text-[var(--color-text-muted)]">{t.note}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[15px] text-[var(--color-text-muted)]">
          No tier is locked. No paywall. Pay what your budget allows. Cancel anytime.
        </p>

        <div className="mt-8 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
          <h3 className="text-[17px] font-medium text-[var(--color-text-primary)] font-serif">For universities + departments</h3>
          <p className="mt-2 max-w-2xl text-[15px] text-[var(--color-text-secondary)]">
            Interested in a deeper relationship — dedicated infrastructure, SSO, DPA, custom features, design-partner
            status? We&apos;d rather have a conversation than quote a number. Partnership pricing is custom; scope is too.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <PrimaryCta href="/signup">Start free</PrimaryCta>
            <GhostCta href="mailto:lowcydizajnu@gmail.com?subject=My%20Research%20Lab%20partnership">
              Talk about a partnership <ArrowRight className="size-4" aria-hidden />
            </GhostCta>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- 9. Audience columns ---------------- */
function Audiences() {
  const young = [
    "Build complex studies without writing a line of code",
    "Replicate any published methodology in one click — perfect for your literature review",
    "Comment with your advisor on specific blocks, not “the whole survey”",
    "Save versions before every meeting; restore if your advisor changes their mind",
    "Free forever; bring your own Prolific account",
    "Export everything in CSV / SPSS / R-friendly formats",
  ];
  const pis = [
    "Preregistration is the default, not an afterthought",
    "Every study version is frozen + cited individually",
    "Cross-workspace replications visible from your study page",
    "Audit trail for every change — IRB-ready out of the box",
    "Adapter architecture: never locked into a vendor again",
    "Pay what feels right at lab level; talk to us about partnerships",
  ];
  return (
    <section className="mx-auto grid w-full max-w-5xl gap-6 px-6 py-20 md:grid-cols-2">
      {[
        { h: "Designed for the way you actually work", items: young, cta: "Start your first study", eyebrow: "For PhD students + postdocs" },
        { h: "Built for the standards you uphold", items: pis, cta: "Start your lab", eyebrow: "For PIs + lab directors" },
      ].map((col) => (
        <div key={col.h} className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
          <Eyebrow>{col.eyebrow}</Eyebrow>
          <h3 className={`${SERIF} text-[length:var(--text-heading-1)] font-medium`}>{col.h}</h3>
          <ul className="flex flex-col gap-2">
            {col.items.map((i) => (
              <li key={i} className="flex items-start gap-2 text-[15px] text-[var(--color-text-secondary)]">
                <Check className="mt-0.5 size-4 shrink-0 text-[var(--color-primary-text-on-subtle)]" aria-hidden />
                {i}
              </li>
            ))}
          </ul>
          <div className="pt-1">
            <PrimaryCta href="/signup">
              {col.cta} <ArrowRight className="size-4" aria-hidden />
            </PrimaryCta>
          </div>
        </div>
      ))}
    </section>
  );
}

/* ---------------- 10. Final CTA ---------------- */
function FinalCta() {
  return (
    <section className="relative mx-auto flex w-full max-w-3xl flex-col items-center gap-5 px-6 py-24 text-center">
      <h2 className={`${SERIF} text-[length:var(--text-display)] font-medium`}>Ready to run better research?</h2>
      <p className="text-[16px] text-[var(--color-text-secondary)]">
        Free for individual researchers. Institutional partnerships available.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <PrimaryCta href="/signup" large>
          Start your first study <ArrowRight className="size-4" aria-hidden />
        </PrimaryCta>
        <GhostCta href="/explore">Browse the library</GhostCta>
      </div>
      <p className="text-[15px] text-[var(--color-text-muted)]">
        No credit card · BYO vendor accounts · Open methodology
      </p>
    </section>
  );
}

/* ---------------- 11. Footer ---------------- */
function Footer() {
  const DOCS = "https://docs.myresearchlab.app";
  const cols: { h: string; links: { label: string; href: string; external?: boolean }[] }[] = [
    { h: "Product", links: [{ label: "Explore", href: "/explore" }, { label: "Sign up", href: "/signup" }, { label: "Sign in", href: "/signin" }] },
    { h: "Resources", links: [{ label: "Docs", href: DOCS, external: true }, { label: "Methodology guides", href: `${DOCS}/methodology`, external: true }] },
    { h: "Legal", links: [{ label: "Terms", href: "/legal/terms" }, { label: "Privacy", href: "/legal/privacy" }, { label: "Security & data", href: "/security" }] },
  ];
  return (
    <footer className="border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] py-12">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 sm:grid-cols-2 md:grid-cols-4">
        <div className="flex flex-col gap-2">
          <span className={`${SERIF} text-[length:var(--text-body-emphasis)] font-medium`}>My Research Lab</span>
          <span className="text-[15px] text-[var(--color-text-muted)]">Run better research, in one workspace.</span>
        </div>
        {cols.map((c) => (
          <nav key={c.h} className="flex flex-col gap-2" aria-label={c.h}>
            <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">{c.h}</span>
            {c.links.map((l) =>
              l.external ? (
                <a key={l.label} href={l.href} className="text-[15px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
                  {l.label}
                </a>
              ) : (
                <Link key={l.label} href={l.href as Route} className="text-[15px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
                  {l.label}
                </Link>
              ),
            )}
          </nav>
        ))}
      </div>
      <p className="mx-auto mt-8 w-full max-w-6xl px-6 text-[15px] text-[var(--color-text-muted)]">
        © 2026 My Research Lab — built by Paweł Rosner
      </p>
    </footer>
  );
}

export function LandingPage() {
  return (
    // Minimal leans hard into IBM Plex Mono (owner): the whole page defaults to
    // font-mono; only the serif display headlines (font-serif) opt back out.
    <main className="relative min-h-screen overflow-hidden bg-[var(--color-surface-page)] font-mono">
      <LandingNav variant="minimal" />
      <LandingSwitcher current="minimal" />
      <Hero />
      <PainPoints />
      <Workflow />
      <Features />
      <Community />
      <TrustSignals />
      <Comparison />
      <Pricing />
      <Audiences />
      <FinalCta />
      <Footer />
    </main>
  );
}
