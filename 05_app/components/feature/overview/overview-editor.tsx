"use client";

import { GripVertical, Plus, X } from "lucide-react";
import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import type { OverviewSection, StudyOverview } from "@/server/modules/blocks";

const SUGGESTED = ["Hypotheses", "Background", "Methods", "Analysis plan", "Ethics / IRB", "References"];

const fieldCls =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

/**
 * Overview stage editor (V1.12 B1, overview-stage.md). Researcher-authored study
 * documentation — abstract + named markdown sections — saved to
 * `definition_snapshot.overview` (rides with the snapshot; preregistration
 * freezes it alongside the blocks). Markdown is rendered safely where the
 * overview is displayed (preregister / OSF / public author page).
 */
export function OverviewEditor({ studyId, initial }: { studyId: string; initial: StudyOverview }) {
  const [abstract, setAbstract] = useState(initial.abstract);
  const [sections, setSections] = useState<OverviewSection[]>(initial.sections);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const save = api.studies.setOverview.useMutation({
    onSuccess: () => {
      setSavedMsg("Overview saved.");
      setTimeout(() => setSavedMsg(null), 3000);
    },
  });

  const dirty = () => setSavedMsg(null);
  const addSection = (heading = "") => {
    setSections((s) => [...s, { id: crypto.randomUUID(), heading, contentMd: "" }]);
    dirty();
  };
  const update = (id: string, patch: Partial<OverviewSection>) => {
    setSections((s) => s.map((sec) => (sec.id === id ? { ...sec, ...patch } : sec)));
    dirty();
  };
  const remove = (id: string) => {
    setSections((s) => s.filter((sec) => sec.id !== id));
    dirty();
  };
  const move = (id: string, dir: -1 | 1) => {
    setSections((s) => {
      const i = s.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.length) return s;
      const copy = [...s];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
    dirty();
  };

  const usedHeadings = new Set(sections.map((s) => s.heading));

  return (
    <div className="flex max-w-[760px] flex-col gap-5">
      <label className="flex flex-col gap-1">
        <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
          Abstract
        </span>
        <textarea
          className={cn(fieldCls, "min-h-[88px] resize-y")}
          placeholder="A short summary of the study (what, why, who)."
          value={abstract}
          maxLength={5000}
          onChange={(e) => {
            setAbstract(e.target.value);
            dirty();
          }}
        />
      </label>

      <div className="flex flex-col gap-3">
        {sections.map((sec, i) => (
          <div
            key={sec.id}
            className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3"
          >
            <div className="flex items-center gap-2">
              <span className="flex flex-col text-[var(--color-text-muted)]">
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(sec.id, -1)} className="leading-none disabled:opacity-30">▴</button>
                <button type="button" aria-label="Move down" disabled={i === sections.length - 1} onClick={() => move(sec.id, 1)} className="leading-none disabled:opacity-30">▾</button>
              </span>
              <GripVertical className="size-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
              <input
                className={cn(fieldCls, "font-medium")}
                placeholder="Section heading (e.g. Hypotheses)"
                value={sec.heading}
                maxLength={200}
                onChange={(e) => update(sec.id, { heading: e.target.value })}
              />
              <button
                type="button"
                aria-label="Remove section"
                onClick={() => remove(sec.id)}
                className="shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-danger-text-on-subtle)]"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <textarea
              className={cn(fieldCls, "min-h-[120px] resize-y")}
              placeholder="Markdown supported."
              value={sec.contentMd}
              maxLength={20000}
              onChange={(e) => update(sec.id, { contentMd: e.target.value })}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => addSection()}
          className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
        >
          <Plus className="size-4" aria-hidden />
          Add section
        </button>
        {SUGGESTED.filter((h) => !usedHeadings.has(h)).map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => addSection(h)}
            className="rounded-full border border-[var(--color-border-subtle)] px-2.5 py-1 text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
          >
            + {h}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <PendingButton
          pending={save.isPending}
          idleLabel="Save overview"
          pendingLabel="Saving…"
          onClick={() => save.mutate({ studyId, overview: { abstract, sections } })}
          className="self-start"
        />
        {savedMsg ? (
          <span role="status" className="text-[length:var(--text-small)] text-[var(--color-success-text-on-subtle)]">
            {savedMsg}
          </span>
        ) : null}
      </div>
    </div>
  );
}
