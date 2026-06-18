import Link from "next/link";
import type { Route } from "next";

import { ParticipantsComingSoon } from "@/components/feature/participants/coming-soon";
import { PROVIDER_STATE_BADGE } from "@/lib/recruitment-status";
import { getServerApi } from "@/server/trpc/server";
import type { OpenRecruitmentStudy } from "@/server/trpc/routers/recruitment";

/**
 * Participants · Open recruitment (V1.15 Stream P2 / participants-destination.md).
 * Provider-side view: per study with a Prolific study attached, the submission
 * counts (reconciled live on load) + a link to the provider. Distinct from
 * Studies · Running (which is our-side recruitment health).
 */
export const dynamic = "force-dynamic";

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">{n}</span>
      <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{label}</span>
    </div>
  );
}

function StudyCard({ s }: { s: OpenRecruitmentStudy }) {
  return (
    <li className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/studies/${s.studyId}/run` as Route}
            className="truncate text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)] hover:text-[var(--color-primary)] hover:underline"
          >
            {s.title}
          </Link>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Prolific · reward {s.reward.currency} {s.reward.amount.toFixed(2)}
            {s.totalPlaces ? ` · ${s.placesTaken ?? 0} / ${s.totalPlaces} recruited` : ""}
          </p>
        </div>
        <span className={`rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[length:var(--text-small)] font-medium ${(PROVIDER_STATE_BADGE[s.state] ?? PROVIDER_STATE_BADGE.unknown).cls}`}>
          {(PROVIDER_STATE_BADGE[s.state] ?? PROVIDER_STATE_BADGE.unknown).label}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 border-t border-[var(--color-border-subtle)] pt-3 sm:grid-cols-5">
        <Stat n={s.counts.started} label="Started" />
        <Stat n={s.counts.submitted} label="Awaiting review" />
        <Stat n={s.counts.approved} label="Approved" />
        <Stat n={s.counts.rejected} label="Rejected" />
        <Stat n={s.counts.timedOut} label="Timed out" />
      </div>

      <div className="flex items-center gap-3">
        <a
          href={s.providerStudyUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[length:var(--text-small)] text-[var(--color-text-secondary)] underline hover:opacity-80"
        >
          Open on Prolific →
        </a>
        <Link
          href={`/studies/${s.studyId}/run` as Route}
          className="text-[length:var(--text-small)] text-[var(--color-text-secondary)] underline hover:opacity-80"
        >
          Manage on the Run stage →
        </Link>
      </div>
    </li>
  );
}

export default async function OpenRecruitmentPage() {
  const api = await getServerApi();
  let studies: OpenRecruitmentStudy[] = [];
  try {
    studies = await api.recruitment.openRecruitment.list();
  } catch {
    studies = [];
  }

  if (studies.length === 0) {
    return (
      <ParticipantsComingSoon
        title="No provider-connected studies yet"
        blurb="Connect Prolific in the Connections tab, then create a Prolific study from a study's Run stage. Studies recruiting on a provider show up here with their submission counts."
      />
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Provider-side recruitment, synced from Prolific. (Recruitment health — response rates, drop-off — lives in
        Studies · Running.)
      </p>
      <ul className="flex flex-col gap-2">
        {studies.map((s) => (
          <StudyCard key={s.studyId} s={s} />
        ))}
      </ul>
    </section>
  );
}
