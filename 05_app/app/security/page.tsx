import type { Metadata } from "next";

/**
 * Public security-posture page (ADR-0072 PF1.3) — linked from
 * /.well-known/security.txt's Policy field. Plain, honest description of how
 * researcher + participant data is protected. No auth (public route).
 */
export const metadata: Metadata = {
  title: "Security — Massive Research Lab",
  description: "How Massive Research Lab protects researcher and participant data, and how to report a vulnerability.",
};

const SECTIONS: { heading: string; body: string }[] = [
  {
    heading: "Reporting a vulnerability",
    body: "Email security@myresearchlab.app. We aim to acknowledge within a few business days and coordinate disclosure — please give us a reasonable window (target: 90 days) to remediate before any public write-up. Machine-readable contact lives at /.well-known/security.txt.",
  },
  {
    heading: "Encryption",
    body: "All traffic is served over HTTPS. The database (Neon Postgres) is encrypted at rest. Third-party credentials you connect (OSF, Prolific, AI provider keys) are encrypted application-side before storage and never returned to the browser.",
  },
  {
    heading: "Authentication",
    body: "Sign-in is handled by Clerk (magic-link + OAuth). We don't store passwords. Sessions are scoped and expire; revoking a session takes effect immediately.",
  },
  {
    heading: "Workspace isolation",
    body: "Every study, response, and asset belongs to a workspace, and every data read is filtered by your workspace membership — one workspace can never see another's data. Participant responses are identified only by an opaque token, not personal identity.",
  },
  {
    heading: "Participant-data boundary",
    body: "Participant-facing pages run free of product analytics and error-tracking context. Diagnostics never carry participant answers or raw personal identifiers — only coarse, non-identifying technical context needed to fix bugs.",
  },
  {
    heading: "Rate limiting & abuse",
    body: "Participant entry and answer submission are rate-limited to protect against abuse and accidental floods, without blocking legitimate respondents.",
  },
  {
    heading: "Sub-processors",
    body: "We rely on a small set of vendors to run the service (hosting, database, authentication, email, AI providers you opt into). The current list and our privacy practices are documented in our privacy policy.",
  },
  {
    heading: "Dependencies & monitoring",
    body: "Dependencies are updated on a weekly automated cadence, and runtime errors are aggregated and alerted so we can respond quickly. We do not currently hold a formal certification (e.g. SOC 2) — appropriate for our stage; we'll revisit as we grow.",
  },
];

export default function SecurityPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">Security</h1>
        <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
          How we protect researcher and participant data — and how to reach us if you find a problem.
        </p>
      </header>

      <div className="flex flex-col gap-5">
        {SECTIONS.map((s) => (
          <section key={s.heading} className="flex flex-col gap-1.5">
            <h2 className="font-serif text-[length:var(--text-title)] font-medium text-[var(--color-text-primary)]">{s.heading}</h2>
            <p className="text-[length:var(--text-body)] leading-relaxed text-[var(--color-text-secondary)]">{s.body}</p>
          </section>
        ))}
      </div>

      <footer className="border-t border-[var(--color-border-subtle)] pt-4 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Security contact: <a className="text-[var(--color-primary)] hover:underline" href="mailto:security@myresearchlab.app">security@myresearchlab.app</a>{" "}
        · <a className="text-[var(--color-primary)] hover:underline" href="/.well-known/security.txt">security.txt</a>
      </footer>
    </main>
  );
}
