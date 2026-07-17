"use client";

import type { OsfQuestion } from "@/server/modules/osf-schema";

/**
 * The last thing between a researcher and a hollow permanent DOI (ADR-0107 D4).
 *
 * The project owner chose warn-and-proceed over a hard block (2026-07-17) — the
 * researcher owns their study. That decision puts the entire weight on this
 * component, so it is not decoration:
 *
 * OSF enforces NOTHING. Verified in source and then observed on the sandbox
 * 2026-07-17: a registration answering none of the 16 required questions
 * returned 201, minted a DOI, and OSF filed all 29 keys as `""`. There is no
 * late 400, no server-side backstop, and nothing in the artifact marks a blank
 * answer as unanswered rather than deliberately empty. Whatever this does not
 * say, nobody says.
 *
 * Rules, from the wireframe:
 *  - Name every question, in OSF's own words. A count is not actionable.
 *  - State the consequence once, factually. No red, no alarm icon, no
 *    "Are you sure?" — this is not a scold, it is the one piece of information
 *    nobody else will give them.
 *  - Never nag. Shown once, at the moment of decision. `role="status"` (polite):
 *    it must not interrupt, because proceeding may be deliberate.
 *  - Renders nothing when everything is answered.
 */
export function UnansweredQuestionsNotice({
  unanswered,
  overviewHref,
}: {
  unanswered: OsfQuestion[];
  overviewHref: string;
}) {
  if (!unanswered.length) return null;

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-4"
    >
      <p className="font-medium text-[var(--color-text-primary)]">
        {unanswered.length === 1
          ? "1 of OSF's questions is unanswered"
          : `${unanswered.length} of OSF's questions are unanswered`}
      </p>
      <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
        OSF will accept your preregistration and mint its DOI either way — it doesn&rsquo;t check. Once filed,
        it&rsquo;s permanent and public, and {unanswered.length === 1 ? "this will read" : "these will read"} as
        blank.
      </p>
      {/* Named, in OSF's words. "6 required fields are empty" is not something a
          researcher can act on; "Starting and stopping rules" is. */}
      <ul className="flex flex-col gap-0.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
        {unanswered.map((q) => (
          <li key={q.key}>· {q.label}</li>
        ))}
      </ul>
      <div>
        {/* Focus, not just scroll — the first unanswered question is where the
            researcher needs to be, keyboard included. */}
        {/* A plain anchor, not next/link: typedRoutes rejects the #fragment,
            and the fragment is the point — it lands on the first unanswered
            question rather than the top of a long page. */}
        <a
          href={`${overviewHref}#osfq-${unanswered[0].key}`}
          className="inline-block rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface)]"
        >
          Answer these
        </a>
      </div>
    </div>
  );
}
