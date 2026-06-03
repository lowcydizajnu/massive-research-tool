"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/trpc/react";
import type { RunInfo } from "@/server/trpc/routers/studies";

/**
 * Run stage (serves the run-a-study JTBD). Opens recruitment for the
 * preregistered version and surfaces the recruitment link Hanna pastes into
 * Prolific (provider integration is V1.6), plus a Preview link. Pause/close are
 * V1.6 — V1.5 opens and shares.
 */
export function RunPanel({
  studyId,
  info,
  recruitmentUrl,
  previewUrl,
}: {
  studyId: string;
  info: RunInfo;
  recruitmentUrl: string;
  previewUrl: string;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const open = api.studies.openRecruitment.useMutation({ onSuccess: () => router.refresh() });

  if (!info.isPreregistered) {
    return (
      <section className="flex flex-col gap-3 border-t border-[var(--color-border-subtle)] pt-4">
        <p className="max-w-prose text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
          Preregister this study before you can run it — participants always take the preregistered
          version.
        </p>
        <Link
          href={`/studies/${studyId}/preregister`}
          className="w-fit rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-[length:var(--text-body-emphasis)] font-medium text-white hover:opacity-90"
        >
          Go to Preregister →
        </Link>
      </section>
    );
  }

  if (!info.recruitment || info.recruitment.status !== "open") {
    return (
      <section className="flex flex-col gap-3 border-t border-[var(--color-border-subtle)] pt-4">
        <p className="max-w-prose text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
          Open recruitment to get a link you can share with participants (e.g. paste into Prolific).
          You can preview the study yourself first.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => open.mutate({ studyId })}
            disabled={open.isPending}
            className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-[length:var(--text-body-emphasis)] font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {open.isPending ? "Opening…" : "Open recruitment"}
          </button>
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-4 py-2 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
          >
            Preview
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 border-t border-[var(--color-border-subtle)] pt-4">
      <div className="flex items-center gap-2 text-[length:var(--text-small)]">
        <span className="rounded-[var(--radius-sm)] bg-[var(--color-success-subtle)] px-2 py-0.5 font-medium text-[var(--color-success-text-on-subtle)]">
          Recruiting
        </span>
        <span className="text-[var(--color-text-muted)]">
          {info.recruitment.currentN} response{info.recruitment.currentN === 1 ? "" : "s"} collected
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">
          Recruitment link
        </label>
        <div className="flex gap-2">
          <input
            readOnly
            value={recruitmentUrl}
            className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-3 py-1.5 font-mono text-[length:var(--text-small)] text-[var(--color-text-primary)]"
          />
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(recruitmentUrl).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
            className="shrink-0 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-[length:var(--text-body-emphasis)] font-medium text-white hover:opacity-90"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Paste this into your recruitment platform. Participants are assigned a condition at random.
        </p>
      </div>

      <a
        href={previewUrl}
        target="_blank"
        rel="noreferrer"
        className="w-fit text-[length:var(--text-small)] text-[var(--color-text-secondary)] underline hover:opacity-80"
      >
        Preview as a participant (no data recorded) →
      </a>
    </section>
  );
}
