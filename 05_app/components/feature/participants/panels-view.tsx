"use client";

import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { READ_ONLY_TITLE, ReadOnlyBanner, useWorkspaceRole } from "@/components/feature/workspace/role-gate";
import { api } from "@/lib/trpc/react";
import type { EligibleStudy, PanelSummary } from "@/server/trpc/routers/panels";

/**
 * Participants · Panels (V1.15 P3 / participants-panels.md, ADR-0051). Curate
 * workspace-scoped cohorts of past participants by opaque PID. Members are added
 * in bulk from a study's submissions. PII-blind: only `external_pid` is ever shown.
 * V1 renders the member list inline-expanded (not a separate detail route) — one
 * surface, lazy-loaded per panel.
 */
function shortPid(pid: string): string {
  return pid.length > 12 ? `${pid.slice(0, 6)}…${pid.slice(-4)}` : pid;
}

export function PanelsView({ initialPanels, studies }: { initialPanels: PanelSummary[]; studies: EligibleStudy[] }) {
  const { role, canWrite } = useWorkspaceRole();
  const utils = api.useUtils();
  const { data: panels } = api.panels.list.useQuery(undefined, { initialData: initialPanels });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const create = api.panels.create.useMutation({
    onSuccess: () => {
      setName("");
      setDescription("");
      setOpen(false);
      setErr(null);
      void utils.panels.list.invalidate();
    },
    onError: (e) => setErr(e.message),
  });

  return (
    <section className="flex flex-col gap-4">
      <ReadOnlyBanner role={role} />

      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-prose text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Panels are cohorts of past participants (by anonymous provider id). Re-recruit them in a new study, or
          exclude them to avoid cross-contamination.
        </p>
        {!open ? (
          <button
            type="button"
            disabled={!canWrite}
            title={canWrite ? undefined : READ_ONLY_TITLE}
            onClick={() => setOpen(true)}
            className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-1.5 text-[length:var(--text-small)] font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            New panel
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4">
          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">Panel name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Wave 1 completers"
              className="w-full max-w-md rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-primary)]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">Description (optional)</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full max-w-md rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-primary)]"
            />
          </label>
          <div className="flex items-center gap-3">
            <PendingButton
              onClick={() => create.mutate({ name, description: description.trim() || undefined })}
              disabled={!name.trim()}
              pending={create.isPending}
              idleLabel="Create panel"
              pendingLabel="Creating…"
              className="w-fit px-4 py-1.5"
            />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setErr(null);
              }}
              className="text-[length:var(--text-small)] text-[var(--color-text-secondary)] underline hover:opacity-80"
            >
              Cancel
            </button>
          </div>
          {err ? (
            <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
              {err}
            </p>
          ) : null}
        </div>
      ) : null}

      {(panels ?? []).length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-6 text-center">
          <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            No panels yet. Create one to re-recruit or exclude past participants by their anonymous provider id.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {(panels ?? []).map((p) => (
            <PanelCard key={p.id} panel={p} studies={studies} canWrite={canWrite} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PanelCard({ panel, studies, canWrite }: { panel: PanelSummary; studies: EligibleStudy[]; canWrite: boolean }) {
  const utils = api.useUtils();
  const [expanded, setExpanded] = useState(false);
  const detail = api.panels.get.useQuery({ panelId: panel.id }, { enabled: expanded });

  const refresh = () => {
    void utils.panels.list.invalidate();
    void utils.panels.get.invalidate({ panelId: panel.id });
  };
  const del = api.panels.delete.useMutation({ onSuccess: () => void utils.panels.list.invalidate() });
  const removeMember = api.panels.removeMember.useMutation({ onSuccess: refresh });

  return (
    <li className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)] hover:text-[var(--color-primary)]"
          >
            {panel.name}
          </button>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            {panel.memberCount} {panel.memberCount === 1 ? "member" : "members"}
            {panel.description ? ` · ${panel.description}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[length:var(--text-small)] text-[var(--color-text-secondary)] underline hover:opacity-80"
          >
            {expanded ? "Hide members" : "View members"}
          </button>
          <button
            type="button"
            disabled={!canWrite || del.isPending}
            title={canWrite ? undefined : READ_ONLY_TITLE}
            onClick={() => {
              if (window.confirm(`Delete panel "${panel.name}"? Its membership is removed (participants are unaffected).`))
                del.mutate({ panelId: panel.id });
            }}
            className="rounded-[var(--radius-sm)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-danger-subtle)] hover:text-[var(--color-danger-text-on-subtle)] disabled:opacity-40"
          >
            {del.isPending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="flex flex-col gap-3 border-t border-[var(--color-border-subtle)] pt-3">
          <AddFromStudy panelId={panel.id} studies={studies} canWrite={canWrite} onAdded={refresh} />
          {detail.isLoading ? (
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading members…</p>
          ) : (detail.data?.members.length ?? 0) === 0 ? (
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              No members yet. Add participants from a study you&rsquo;ve run.
            </p>
          ) : (
            <table className="w-full text-left text-[length:var(--text-small)]">
              <caption className="sr-only">Members of {panel.name}</caption>
              <thead className="text-[var(--color-text-muted)]">
                <tr>
                  <th className="py-1 font-medium">Participant (opaque id)</th>
                  <th className="py-1 font-medium">First seen in</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {detail.data!.members.map((m) => (
                  <tr key={m.externalPid} className="border-t border-[var(--color-border-subtle)]">
                    <td className="py-1 font-mono text-[var(--color-text-primary)]" title={m.externalPid}>
                      {shortPid(m.externalPid)}
                    </td>
                    <td className="py-1 text-[var(--color-text-secondary)]">{m.sourceStudyTitle ?? "—"}</td>
                    <td className="py-1 text-right">
                      <button
                        type="button"
                        disabled={!canWrite || removeMember.isPending}
                        title={canWrite ? undefined : READ_ONLY_TITLE}
                        onClick={() => removeMember.mutate({ panelId: panel.id, externalPid: m.externalPid })}
                        className="text-[var(--color-text-muted)] underline hover:text-[var(--color-danger-text-on-subtle)] disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </li>
  );
}

function AddFromStudy({
  panelId,
  studies,
  canWrite,
  onAdded,
}: {
  panelId: string;
  studies: EligibleStudy[];
  canWrite: boolean;
  onAdded: () => void;
}) {
  const [studyId, setStudyId] = useState("");
  const [statuses, setStatuses] = useState<"approved" | "completed" | "all">("completed");
  const [note, setNote] = useState<string | null>(null);
  const add = api.panels.addMembersFromStudy.useMutation({
    onSuccess: (r) => {
      setNote(`Added ${r.added}${r.alreadyPresent ? ` · ${r.alreadyPresent} already in the panel` : ""}.`);
      onAdded();
    },
    onError: (e) => setNote(e.message),
  });

  if (studies.length === 0) {
    return (
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Add members by running a study that recruits on a provider — its participants appear here.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={studyId}
        onChange={(e) => setStudyId(e.target.value)}
        disabled={!canWrite}
        className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-primary)]"
      >
        <option value="">Add from a study…</option>
        {studies.map((s) => (
          <option key={s.studyId} value={s.studyId}>
            {s.title} ({s.submissionCount})
          </option>
        ))}
      </select>
      <select
        value={statuses}
        onChange={(e) => setStatuses(e.target.value as "approved" | "completed" | "all")}
        disabled={!canWrite}
        className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-primary)]"
      >
        <option value="completed">Completed (approved + awaiting review)</option>
        <option value="approved">Approved only</option>
        <option value="all">Everyone who started</option>
      </select>
      <PendingButton
        variant="secondary"
        onClick={() => studyId && add.mutate({ panelId, studyId, statuses })}
        disabled={!canWrite || !studyId}
        pending={add.isPending}
        idleLabel="Add"
        pendingLabel="Adding…"
        className="px-3 py-1.5 text-[length:var(--text-small)]"
      />
      {note ? (
        <span aria-live="polite" className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {note}
        </span>
      ) : null}
    </div>
  );
}
