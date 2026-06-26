"use client";

import Link from "next/link";

import { api } from "@/lib/trpc/react";

/**
 * Build-stage banner (audit step 2) shown once a study has a FROZEN version:
 * makes explicit that edits here are a separate draft and won't reach
 * participants until publish/amend — the silent draft/run/OSF drift footgun.
 * Stronger wording when the draft has actually diverged from the live version.
 * Renders nothing for never-frozen (pure draft) studies.
 */
export function BuildDriftBanner({ studyId }: { studyId: string }) {
  const { data } = api.studies.getRunInfo.useQuery({ studyId });
  if (!data?.runnable) return null;

  const kind = data.versionKind === "preregistered" ? "preregistered" : "published";
  const recruiting = data.recruitment?.status === "open";
  const next = data.versionKind === "preregistered" ? "file an amendment" : "publish a new version";
  const diverged = data.divergedFromLive;

  return (
    <div
      role="status"
      className={
        "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--radius-md)] border px-4 py-2 text-[length:var(--text-small)] " +
        (diverged
          ? "border-[var(--color-warning-subtle)] bg-[var(--color-warning-subtle)] text-[var(--color-warning-text-on-subtle)]"
          : "border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]")
      }
    >
      <span>
        {diverged ? (
          <>
            <strong className="font-medium">Your draft has changes that aren’t live.</strong> Participants get the frozen {kind} version {data.liveVersionNumber}
            {recruiting ? " (recruiting now)" : ""} — your edits here won’t reach them until you {next}.
          </>
        ) : (
          <>
            Version {data.liveVersionNumber} is frozen and {recruiting ? "recruiting" : "live"}. Editing here starts a new draft — participants keep getting v{data.liveVersionNumber} until you {next}. <span className="text-[var(--color-text-muted)]">Nothing to publish right now — your draft matches the live version.</span>
          </>
        )}
      </span>
      {/* Action link ONLY when there's something to make live — otherwise it's a
          dead-end (the make-live control on Run/Preregister only appears under
          drift). The not-diverged banner is purely informational. */}
      {diverged ? (
        <Link
          href={`/studies/${studyId}/${data.versionKind === "preregistered" ? "preregister" : "run"}`}
          className="font-medium underline hover:opacity-80"
        >
          {data.versionKind === "preregistered" ? "File an amendment in Preregister →" : "Make it live in Run →"}
        </Link>
      ) : null}
    </div>
  );
}
