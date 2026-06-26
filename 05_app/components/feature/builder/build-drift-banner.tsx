"use client";

import Link from "next/link";

import { api } from "@/lib/trpc/react";

/**
 * Build-stage drift banner (audit step 2) — warns ONLY when the editable draft
 * has diverged from the frozen live version: edits here won't reach participants
 * until you publish/amend. No drift ⇒ no banner (a banner with no action is just
 * noise). Styled as a compact contained chip, matching the replication banner.
 */
export function BuildDriftBanner({ studyId }: { studyId: string }) {
  const { data } = api.studies.getRunInfo.useQuery({ studyId });
  if (!data?.runnable || !data.divergedFromLive) return null;

  const isPrereg = data.versionKind === "preregistered";
  const kind = isPrereg ? "preregistered" : "published";
  const recruiting = data.recruitment?.status === "open";
  const next = isPrereg ? "file an amendment" : "publish a new version";

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--radius-md)] border border-[var(--color-warning-subtle)] bg-[var(--color-warning-subtle)]/40 px-3 py-2 text-[length:var(--text-small)] text-[var(--color-warning-text-on-subtle)]"
    >
      <span>
        <strong className="font-medium">Your draft has changes that aren’t live.</strong> Participants get the frozen {kind} version {data.liveVersionNumber}
        {recruiting ? " (recruiting now)" : ""} — your edits here won’t reach them until you {next}.
      </span>
      <Link
        href={`/studies/${studyId}/${isPrereg ? "preregister" : "run"}`}
        className="font-medium text-[var(--color-primary)] hover:underline"
      >
        {isPrereg ? "File an amendment ↗" : "Make it live in Run ↗"}
      </Link>
    </div>
  );
}
