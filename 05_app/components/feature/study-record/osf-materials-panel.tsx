"use client";

import { File, FileJson, FileText, Image as ImageIcon, Music, Video } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";
import type { StudyOsfMaterialArtifact } from "@/server/trpc/routers/study-record";

/**
 * "Materials on OSF" (ADR-0094). Uploads a study's stimulus files + the design
 * snapshot + a protocol PDF to its editable OSF **project** node (never the
 * frozen registration). On-demand from the Study Record; owner/editor only
 * (the query is a writeProcedure, so viewers never see it). Participant response
 * data is never uploaded.
 */
export function OsfMaterialsPanel({ studyId }: { studyId: string }) {
  const q = api.studyRecord.getMaterialsForOsf.useQuery({ studyId });
  const utils = api.useUtils();
  const upload = api.studyRecord.uploadMaterialsToOsf.useMutation();
  const [note, setNote] = useState<string | null>(null);

  // Hidden for viewers (query errors), and for studies with no frozen version.
  if (q.error) return null;
  if (q.isLoading) return null;
  const d = q.data;
  if (!d || !d.hasVersion) return null;

  const anyUploaded = d.artifacts.some((a) => a.status === "uploaded");
  const canUpload = d.connected && d.hasNode;

  const run = async () => {
    setNote(null);
    try {
      const r = await upload.mutateAsync({ studyId });
      await utils.studyRecord.getMaterialsForOsf.invalidate({ studyId });
      setNote(
        r.failed || r.skipped
          ? `${r.uploaded} of ${r.total} uploaded${r.failed ? `, ${r.failed} failed` : ""}${r.skipped ? `, ${r.skipped} skipped` : ""}.`
          : `Uploaded ${r.uploaded} file${r.uploaded === 1 ? "" : "s"} to OSF.`,
      );
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Upload to OSF failed.");
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
          Materials on OSF
        </h3>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Send your stimuli, the design snapshot, and a protocol PDF to your OSF project.
        </p>
      </div>

      {!d.connected ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          <Link href="/participants/connections" className="font-medium underline">
            Connect OSF
          </Link>{" "}
          in Settings · Connections to upload materials.
        </p>
      ) : !d.hasNode ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          <Link href={`/studies/${studyId}/preregister`} className="font-medium underline">
            Preregister to OSF first
          </Link>{" "}
          — materials attach to your study&rsquo;s OSF project.
        </p>
      ) : null}

      <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
        {d.artifacts.map((a) => (
          <li
            key={a.artifactKey}
            className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              <ArtifactIcon a={a} />
              <span className="truncate text-[length:var(--text-small)] text-[var(--color-text-primary)]" title={a.fileName}>
                {a.fileName}
              </span>
            </div>
            <StatusPill a={a} />
          </li>
        ))}
      </ul>

      {note ? (
        <p role="status" className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {note}
        </p>
      ) : d.lastUploadedAt ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Last uploaded {relativeTime(d.lastUploadedAt)}.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <PendingButton
          pending={upload.isPending}
          disabled={!canUpload}
          onClick={run}
          idleLabel={anyUploaded ? "Re-upload to OSF" : "Upload to OSF"}
          pendingLabel="Uploading…"
          className="px-3 py-1.5 text-[length:var(--text-small)]"
        />
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Files go to your OSF project — private unless you make it public. Participant responses are never included.
        </p>
      </div>
    </section>
  );
}

function ArtifactIcon({ a }: { a: StudyOsfMaterialArtifact }) {
  const cls = "size-4 shrink-0 text-[var(--color-text-muted)]";
  if (a.kind === "design-json") return <FileJson className={cls} aria-hidden />;
  if (a.kind === "protocol-pdf") return <FileText className={cls} aria-hidden />;
  const ext = a.fileName.includes(".") ? a.fileName.slice(a.fileName.lastIndexOf(".") + 1).toLowerCase() : "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return <ImageIcon className={cls} aria-hidden />;
  if (["mp3", "wav", "m4a", "ogg"].includes(ext)) return <Music className={cls} aria-hidden />;
  if (["mp4", "webm", "mov"].includes(ext)) return <Video className={cls} aria-hidden />;
  return <File className={cls} aria-hidden />;
}

function StatusPill({ a }: { a: StudyOsfMaterialArtifact }) {
  const base = "shrink-0 rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[length:var(--text-small)] font-medium";
  if (a.status === "uploaded") {
    const pill = (
      <span className={`${base} bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]`}>Uploaded</span>
    );
    return a.osfUrl ? (
      <a href={a.osfUrl} target="_blank" rel="noopener noreferrer" className="underline" aria-label={`Open ${a.fileName} on OSF`}>
        {pill}
      </a>
    ) : (
      pill
    );
  }
  if (a.status === "failed") {
    return (
      <span className={`${base} bg-[var(--color-danger-subtle)] text-[var(--color-danger-text-on-subtle)]`} title={a.error ?? undefined}>
        Failed
      </span>
    );
  }
  if (a.status === "skipped") {
    return (
      <span className={`${base} bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]`} title={a.error ?? undefined}>
        Skipped
      </span>
    );
  }
  return <span className={`${base} bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]`}>Not uploaded</span>;
}

/** Coarse relative time for the "last uploaded" caption (client-only). */
function relativeTime(iso: string): string {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}
