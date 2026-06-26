"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/trpc/react";
import { PANEL_DEFAULTS, type PanelIntegration } from "@/lib/take/panel-integration";
import { READ_ONLY_TITLE, useWorkspaceRole } from "@/components/feature/workspace/role-gate";

/**
 * External research-panel / agency integration (ADR-0071) — one Run-stage card,
 * next to Prolific, consolidating panel hand-off: respondent-id URL param →
 * external_id, completion + consent-refusal redirects with delay + sticky box,
 * and skip-refusal-screen. Structured fields only (no arbitrary code). Empty =
 * standard flow. Autosaves on blur via studies.setPanelIntegration.
 */
const INPUT =
  "rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[length:var(--text-body)] text-[var(--color-text-primary)] disabled:opacity-60";
const HELP = "text-[length:var(--text-small)] text-[var(--color-text-muted)]";
const LABEL = "text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]";

export function ExternalPanelCard({ studyId, initial }: { studyId: string; initial: PanelIntegration }) {
  const { canWrite } = useWorkspaceRole();
  const utils = api.useUtils();
  const save = api.studies.setPanelIntegration.useMutation({
    onSuccess: () => void utils.studies.get.invalidate({ id: studyId }),
  });
  const [cfg, setCfg] = useState<PanelIntegration>(initial);
  useEffect(() => setCfg(initial), [initial]);

  const set = <K extends keyof PanelIntegration>(k: K, v: PanelIntegration[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const commit = () => {
    if (canWrite) save.mutate({ studyId, config: cfg as unknown as Record<string, unknown> });
  };
  const num = (v: string, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
      <div>
        <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">External panel / agency</h2>
        <p className={HELP}>
          For studies recruited through an agency panel. All optional — empty = standard flow, no integration.
          {save.isPending ? " · saving…" : ""}
        </p>
      </div>

      <fieldset disabled={!canWrite} title={canWrite ? undefined : READ_ONLY_TITLE} className="flex flex-col gap-4">
        {/* Respondent id param */}
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Respondent-ID URL parameter</span>
          <input
            className={`${INPUT} w-48`}
            value={cfg.respondentIdParam}
            placeholder={PANEL_DEFAULTS.respondentIdParam}
            onChange={(e) => set("respondentIdParam", e.target.value)}
            onBlur={commit}
          />
          <span className={HELP}>
            The agency appends e.g. <code>?{cfg.respondentIdParam || "res_id"}=ABC123</code>; the value is stored as{" "}
            <code>external_id</code> in the export.
          </span>
        </label>

        {/* Completion */}
        <div className="flex flex-col gap-2 border-t border-[var(--color-border-subtle)] pt-3">
          <span className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">On completion</span>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Redirect link</span>
            <input className={INPUT} value={cfg.completionUrl} placeholder="https://panel.agency.com/complete?id={ext_id}" onChange={(e) => set("completionUrl", e.target.value)} onBlur={commit} />
            <span className={HELP}>
              After the debrief the participant is sent here. Placeholders: <code>{"{ext_id}"}</code> (the URL param value) and{" "}
              <code>{"{session_id}"}</code> (our session token). Empty = standard end screen.
            </span>
          </label>
          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Redirect delay (seconds)</span>
              <input className={`${INPUT} w-24`} type="number" min={0} max={600} value={cfg.completionDelaySec} onChange={(e) => set("completionDelaySec", num(e.target.value, 4))} onBlur={commit} />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className={LABEL}>Sticky “return to panel” box text</span>
              <input className={INPUT} value={cfg.completionStickyText} placeholder="e.g. Finish & return to the panel" onChange={(e) => set("completionStickyText", e.target.value)} onBlur={commit} />
            </label>
          </div>
          <span className={HELP}>Delay 0 = redirect immediately. Sticky box = a pinned “Return to panel →” bar (click skips the wait). Both apply only when a redirect link is set.</span>
        </div>

        {/* Refusal */}
        <div className="flex flex-col gap-2 border-t border-[var(--color-border-subtle)] pt-3">
          <span className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">On consent refusal (screen-out)</span>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Redirect link</span>
            <input className={INPUT} value={cfg.refusalUrl} placeholder="https://panel.agency.com/screenout?id={ext_id}" onChange={(e) => set("refusalUrl", e.target.value)} onBlur={commit} />
            <span className={HELP}>Used when the participant declines consent (panels usually want a different URL — no points awarded). Same placeholders. Empty = local “no problem” screen.</span>
          </label>
          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Redirect delay (seconds)</span>
              <input className={`${INPUT} w-24`} type="number" min={0} max={600} value={cfg.refusalDelaySec} onChange={(e) => set("refusalDelaySec", num(e.target.value, 4))} onBlur={commit} />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className={LABEL}>Sticky box text</span>
              <input className={INPUT} value={cfg.refusalStickyText} placeholder="e.g. Returning you to the panel…" onChange={(e) => set("refusalStickyText", e.target.value)} onBlur={commit} />
            </label>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-primary)]"
              checked={cfg.skipRefusalScreen}
              onChange={(e) => {
                const next = { ...cfg, skipRefusalScreen: e.target.checked };
                setCfg(next);
                if (canWrite) save.mutate({ studyId, config: next as unknown as Record<string, unknown> });
              }}
            />
            <span className={LABEL}>Skip the refusal screen — redirect immediately</span>
          </label>
          <span className={HELP}>When checked, declining jumps straight to the redirect (no local screen). Only applies when a refusal link is set.</span>
        </div>
      </fieldset>
    </section>
  );
}
