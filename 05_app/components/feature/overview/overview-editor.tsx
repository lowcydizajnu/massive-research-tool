"use client";

import { GripVertical, Plus, X } from "lucide-react";
import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import {
  PREREG_TEMPLATES,
  defaultTemplateKey,
  templateAsks,
  type PreregTemplateKey,
} from "@/lib/prereg-templates";
import { DesignFactsPanel } from "@/components/feature/overview/design-facts-panel";
import { SubjectPicker } from "@/components/feature/overview/subject-picker";
import { TemplateQuestions } from "@/components/feature/overview/template-questions";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import type {
  ExpectedOutcome,
  OverviewSection,
  PlanVariable,
  StudyOverview,
  VariableRole,
} from "@/server/modules/blocks";
import type { DataCollectionStatus } from "@/server/trpc/routers/studies";

/** "Analysis plan" is deliberately absent — it is a typed field now (ADR-0101),
 *  and offering a free-markdown section of the same name would create two homes
 *  for one concept. */
const SUGGESTED = ["Background", "Methods", "Ethics / IRB", "References"];

const ROLES: { value: VariableRole; label: string }[] = [
  { value: "iv", label: "Independent" },
  { value: "dv", label: "Dependent" },
  { value: "covariate", label: "Covariate" },
  { value: "exclusion", label: "Exclusion" },
];

const COLLECTION_CHIP: Record<DataCollectionStatus, { label: string; cls: string }> = {
  "not-started": {
    label: "Not started",
    cls: "bg-[var(--color-success-subtle)] text-[var(--color-success-text-on-subtle)]",
  },
  collecting: {
    label: "Collecting",
    cls: "bg-[var(--color-warning-subtle)] text-[var(--color-warning-text-on-subtle)]",
  },
  finished: {
    label: "Finished",
    cls: "bg-[var(--color-warning-subtle)] text-[var(--color-warning-text-on-subtle)]",
  },
};

const labelCls = "text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]";

const fieldCls =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

/**
 * Overview stage editor (V1.12 B1, overview-stage.md). Researcher-authored study
 * documentation — abstract + named markdown sections — saved to
 * `definition_snapshot.overview` (rides with the snapshot; preregistration
 * freezes it alongside the blocks). Markdown is rendered safely where the
 * overview is displayed (preregister / OSF / public author page).
 */
export function OverviewEditor({
  studyId,
  initial,
  isReplication = false,
  dataCollection = "not-started",
  measures = [],
}: {
  studyId: string;
  initial: StudyOverview;
  isReplication?: boolean;
  /** Server-derived (ADR-0101); read-only here — drives the chip, never sent back. */
  dataCollection?: DataCollectionStatus;
  /** Response-collecting blocks a plan variable can be measured by. */
  measures?: { instanceId: string; name: string }[];
}) {
  const [abstract, setAbstract] = useState(initial.abstract);
  const [hypotheses, setHypotheses] = useState<string[]>(initial.hypotheses);
  const [sections, setSections] = useState<OverviewSection[]>(initial.sections);
  const [replicationNotes, setReplicationNotes] = useState(initial.replicationNotes);
  // The stored key is only the EXPLICIT choice. Keep that distinction on THIS side
  // of the wire too: seeding one state with the derived default and sending it on
  // every save would persist the default as a choice the researcher never made —
  // the exact round-trip hazard `readOverview` refuses to commit server-side, and
  // it would then beat the derivation forever (declare a replication intent later
  // and the plan would still file as Open-ended). So: hold the explicit choice,
  // which stays undefined until the researcher actually picks; resolve the derived
  // default only for display.
  const [explicitTemplateKey, setExplicitTemplateKey] = useState<PreregTemplateKey | undefined>(initial.templateKey);
  const templateKey: PreregTemplateKey = explicitTemplateKey ?? defaultTemplateKey(initial.replicationIntent);
  const [samplingPlan, setSamplingPlan] = useState(initial.samplingPlan.text);
  const [analysisPlan, setAnalysisPlan] = useState(initial.analysisPlan.text);
  const [variables, setVariables] = useState<PlanVariable[]>(initial.variables);
  const [expectedOutcomes, setExpectedOutcomes] = useState<ExpectedOutcome[]>(initial.expectedOutcomes);
  // Replication-recipe-only fields (the Recipe's own OSF questions).
  const [originalStudy, setOriginalStudy] = useState(initial.originalStudy.text);
  const [targetEffect, setTargetEffect] = useState(initial.targetEffect.text);
  const [differences, setDifferences] = useState(initial.differences.text);
  // ADR-0106 D5. Unlike `templateKey` there is no derived default to protect: the
  // stored value IS the answer, and `readOverview` already resolves absent → true.
  // So a plain boolean round-trips honestly.
  const [discloseDerivation, setDiscloseDerivation] = useState(initial.discloseDerivation);
  // ADR-0107. Keyed by OSF response key, so switching templates hides questions
  // but never destroys answers.
  const [templateAnswers, setTemplateAnswers] = useState(initial.templateAnswers);
  const [osfSubjectIds, setOsfSubjectIds] = useState(initial.osfSubjectIds);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // The design facts feed BOTH the panel and the Variables pre-fill — one query,
  // one source (ADR-0106; wireframe: one list, not three).
  const facts = api.studies.getDesignFacts.useQuery({ studyId }).data;
  // Read live from OSF (public endpoint — no connection needed). `null` for
  // templates whose plan we compose or map ourselves.
  // Keyed on the SELECTED template so the questions appear the moment it is
  // picked, not after a save.
  const osfQuestions = api.studies.getTemplateQuestions.useQuery({ studyId, templateKey });
  const osfSubjects = api.studies.listOsfSubjects.useQuery().data;

  const save = api.studies.setOverview.useMutation({
    onSuccess: () => {
      setSavedMsg("Overview saved.");
      setTimeout(() => setSavedMsg(null), 3000);
    },
  });

  const dirty = () => setSavedMsg(null);
  const setHyp = (i: number, v: string) => {
    setHypotheses((h) => h.map((x, j) => (j === i ? v : x)));
    dirty();
  };
  const addHyp = () => {
    setHypotheses((h) => [...h, ""]);
    dirty();
  };
  const removeHyp = (i: number) => {
    setHypotheses((h) => h.filter((_, j) => j !== i));
    dirty();
  };
  const moveHyp = (i: number, dir: -1 | 1) => {
    setHypotheses((h) => {
      const j = i + dir;
      if (j < 0 || j >= h.length) return h;
      const c = [...h];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
    dirty();
  };
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

  // --- Typed plan fields (ADR-0101) ---
  const addVariable = () => {
    setVariables((v) => [
      ...v,
      { id: crypto.randomUUID(), name: "", role: "iv", instanceId: null, notes: "", source: "researcher" },
    ]);
    dirty();
  };
  /**
   * "Declare variable" on a measure (ADR-0106 D3; wireframe: each measure
   * appears once and carries its own action).
   *
   * Sets the name and the block link — the two things the design actually knows
   * — and stops. The ROLE is the researcher's: iv/dv/covariate/exclusion is
   * intent, and guessing it is the invention this item exists to refuse. Not
   * declaring a measure at all is normal too; an attention check needn't be in
   * anyone's hypothesis. `source` is never sent — the server derives it from
   * whether the link resolves (D4).
   */
  const declareMeasure = (m: { instanceId: string; name: string }) => {
    setVariables((v) =>
      v.some((x) => x.instanceId === m.instanceId)
        ? v // already declared — the row shows its role, not the button
        : [...v, { id: crypto.randomUUID(), name: m.name, role: "dv", instanceId: m.instanceId, notes: "", source: "derived" }],
    );
    dirty();
  };

  /** instanceId → role label, so a declared measure states what it is instead of
   *  re-offering the button. Reads the editor's CURRENT variables, not the last
   *  save, or a just-declared row would keep offering to declare itself. */
  const declaredRoles: Record<string, string> = Object.fromEntries(
    variables
      .filter((v) => v.instanceId)
      .map((v) => [v.instanceId as string, ROLES.find((r) => r.value === v.role)?.label ?? v.role]),
  );
  const updateVariable = (id: string, patch: Partial<PlanVariable>) => {
    setVariables((v) => v.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    dirty();
  };
  const removeVariable = (id: string) => {
    setVariables((v) => v.filter((x) => x.id !== id));
    dirty();
  };
  const moveVariable = (id: string, dir: -1 | 1) => {
    setVariables((v) => {
      const i = v.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= v.length) return v;
      const c = [...v];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
    dirty();
  };

  const addOutcome = () => {
    setExpectedOutcomes((o) => [
      ...o,
      { id: crypto.randomUUID(), hypothesisIndex: null, prediction: "", source: "researcher" },
    ]);
    dirty();
  };
  const updateOutcome = (id: string, patch: Partial<ExpectedOutcome>) => {
    setExpectedOutcomes((o) => o.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    dirty();
  };
  const removeOutcome = (id: string) => {
    setExpectedOutcomes((o) => o.filter((x) => x.id !== id));
    dirty();
  };

  const usedHeadings = new Set(sections.map((s) => s.heading));
  const chip = COLLECTION_CHIP[dataCollection];

  return (
    <div className="flex max-w-[760px] flex-col gap-5">
      {/* Preregistration template (ADR-0101). Governs which typed fields show and
          which OSF registration form the plan is filed under. NOT a starter study
          (`workspace_template`) and not the retired Framework — see the Vocabulary
          table in design-rules. */}
      <fieldset className="flex flex-col gap-2">
        <legend className={cn(labelCls, "mb-2")}>Preregistration template</legend>
        <div role="radiogroup" aria-label="Preregistration template" className="flex flex-col gap-2">
          {PREREG_TEMPLATES.map((t) => (
            <label
              key={t.key}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border p-3",
                templateKey === t.key
                  ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)]"
                  : "border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)]",
              )}
            >
              <input
                type="radio"
                name="prereg-template"
                value={t.key}
                checked={templateKey === t.key}
                aria-describedby={`tpl-${t.key}-desc`}
                onChange={() => {
                  setExplicitTemplateKey(t.key);
                  dirty();
                }}
                className="mt-1"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
                  {t.label}
                </span>
                <span id={`tpl-${t.key}-desc`} className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                  {t.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1">
        <span className={labelCls}>Abstract</span>
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

      {isReplication ? (
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
            Notes on changes from the original
          </span>
          <textarea
            className={cn(fieldCls, "min-h-[72px] resize-y")}
            placeholder="Explain what you changed and why (complements the auto-generated diff above)."
            value={replicationNotes}
            maxLength={5000}
            onChange={(e) => {
              setReplicationNotes(e.target.value);
              dirty();
            }}
          />
        </label>
      ) : null}

      <div className="flex flex-col gap-2">
        <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
          Hypotheses
        </span>
        {hypotheses.length === 0 ? (
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Add your numbered hypotheses (H1, H2, …) — they’re frozen into the preregistration.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {hypotheses.map((h, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="flex flex-col pt-2 text-[var(--color-text-muted)]">
                  <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => moveHyp(i, -1)} className="leading-none disabled:opacity-30">▴</button>
                  <button type="button" aria-label="Move down" disabled={i === hypotheses.length - 1} onClick={() => moveHyp(i, 1)} className="leading-none disabled:opacity-30">▾</button>
                </span>
                <span className="pt-2 font-mono text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">
                  H{i + 1}
                </span>
                <textarea
                  className={cn(fieldCls, "min-h-[44px] resize-y")}
                  placeholder="e.g. Warning labels reduce perceived credibility of false headlines."
                  value={h}
                  maxLength={1000}
                  onChange={(e) => setHyp(i, e.target.value)}
                />
                <button
                  type="button"
                  aria-label={`Remove hypothesis ${i + 1}`}
                  onClick={() => removeHyp(i)}
                  className="mt-1.5 shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-danger-text-on-subtle)]"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={addHyp}
          className="inline-flex items-center gap-1 self-start rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
        >
          <Plus className="size-4" aria-hidden />
          Add hypothesis
        </button>
      </div>

      {/* --- Typed plan fields (ADR-0101) ---------------------------------
          Which fields appear is declared by the chosen template's `fields` set —
          that is what makes the picker mean something. Hiding a field never
          destroys its stored value; the plan is one object, not per-template. */}
      {templateAsks(templateKey, "originalStudy") ? (
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Original study</span>
          <textarea
            className={cn(fieldCls, "min-h-[56px] resize-y")}
            placeholder="The study you're replicating — citation, and its OSF/DOI link if it has one."
            value={originalStudy}
            maxLength={2000}
            onChange={(e) => {
              setOriginalStudy(e.target.value);
              dirty();
            }}
          />
          <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            {isReplication
              ? "Leave blank to use the study you replicated from."
              : "Filed as the Replication recipe's “original study” answer."}
          </span>
        </label>
      ) : null}

      {templateAsks(templateKey, "targetEffect") ? (
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Target effect</span>
          <textarea
            className={cn(fieldCls, "min-h-[72px] resize-y")}
            placeholder="The effect you're replicating, with the original's key statistics (e.g. d = .40, N = 120)."
            value={targetEffect}
            maxLength={2000}
            onChange={(e) => {
              setTargetEffect(e.target.value);
              dirty();
            }}
          />
        </label>
      ) : null}

      {templateAsks(templateKey, "samplingPlan") ? (
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Sampling plan</span>
          <textarea
            className={cn(fieldCls, "min-h-[72px] resize-y")}
            placeholder="Target N and the power analysis that produced it."
            value={samplingPlan}
            maxLength={2000}
            onChange={(e) => {
              setSamplingPlan(e.target.value);
              dirty();
            }}
          />
        </label>
      ) : null}

      {templateAsks(templateKey, "analysisPlan") ? (
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Analysis plan</span>
          <textarea
            className={cn(fieldCls, "min-h-[96px] resize-y")}
            placeholder="The analysis you commit to running. Markdown supported."
            value={analysisPlan}
            maxLength={20000}
            onChange={(e) => {
              setAnalysisPlan(e.target.value);
              dirty();
            }}
          />
        </label>
      ) : null}

      {templateAsks(templateKey, "differences") ? (
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Differences from the original</span>
          <textarea
            className={cn(fieldCls, "min-h-[72px] resize-y")}
            placeholder="Anything protocol-wide that differs from the original."
            value={differences}
            maxLength={20000}
            onChange={(e) => {
              setDifferences(e.target.value);
              dirty();
            }}
          />
          <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Per-block differences are documented on each block in Build and are filed alongside this.
          </span>
        </label>
      ) : null}

      <DesignFactsPanel
        facts={facts}
        declaredRoles={declaredRoles}
        onDeclare={declareMeasure}
        discloseDerivation={discloseDerivation}
        onDiscloseChange={(v) => {
          setDiscloseDerivation(v);
          dirty();
        }}
      />

      {templateAsks(templateKey, "variables") ? (
      <div className="flex flex-col gap-2">
        <span className={labelCls}>Variables</span>
        {variables.length === 0 ? (
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Name what you manipulate and what you measure — they&rsquo;re frozen into the preregistration.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {variables.map((v, i) => (
              <li key={v.id} className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3">
                <div className="flex items-start gap-2">
                  <span className="flex flex-col pt-2 text-[var(--color-text-muted)]">
                    <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => moveVariable(v.id, -1)} className="leading-none disabled:opacity-30">▴</button>
                    <button type="button" aria-label="Move down" disabled={i === variables.length - 1} onClick={() => moveVariable(v.id, 1)} className="leading-none disabled:opacity-30">▾</button>
                  </span>
                  <input
                    className={cn(fieldCls, "flex-1")}
                    placeholder="Variable name (e.g. Warning label)"
                    value={v.name}
                    maxLength={200}
                    aria-label={`Variable ${i + 1} name`}
                    onChange={(e) => updateVariable(v.id, { name: e.target.value })}
                  />
                  <button
                    type="button"
                    aria-label={`Remove variable ${i + 1}`}
                    onClick={() => removeVariable(v.id)}
                    className="mt-1.5 shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-danger-text-on-subtle)]"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 pl-6">
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Role</span>
                    <select
                      className={cn(fieldCls, "w-auto")}
                      value={v.role}
                      onChange={(e) => updateVariable(v.id, { role: e.target.value as VariableRole })}
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Measured by</span>
                    <select
                      className={cn(fieldCls, "w-auto")}
                      value={v.instanceId ?? ""}
                      onChange={(e) => updateVariable(v.id, { instanceId: e.target.value || null })}
                    >
                      <option value="">— not linked —</option>
                      {measures.map((m) => (
                        <option key={m.instanceId} value={m.instanceId}>{m.name}</option>
                      ))}
                      {/* A linked block that has since been deleted keeps the row honest. */}
                      {v.instanceId && !measures.some((m) => m.instanceId === v.instanceId) ? (
                        <option value={v.instanceId}>(removed block)</option>
                      ) : null}
                    </select>
                  </label>
                  <label className="flex flex-1 flex-col gap-0.5">
                    <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Notes</span>
                    <input
                      className={fieldCls}
                      placeholder="e.g. present / absent"
                      value={v.notes}
                      maxLength={1000}
                      onChange={(e) => updateVariable(v.id, { notes: e.target.value })}
                    />
                  </label>
                </div>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={addVariable}
          className="inline-flex items-center gap-1 self-start rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
        >
          <Plus className="size-4" aria-hidden />
          Add variable
        </button>
      </div>
      ) : null}

      {templateAsks(templateKey, "expectedOutcomes") ? (
      <div className="flex flex-col gap-2">
        <span className={labelCls}>Expected outcomes</span>
        {expectedOutcomes.length === 0 ? (
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            What do you predict will happen? Tie a prediction to a hypothesis where it has one.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {expectedOutcomes.map((o, i) => (
              <li key={o.id} className="flex items-start gap-2">
                <select
                  className={cn(fieldCls, "mt-0 w-auto shrink-0")}
                  value={o.hypothesisIndex ?? ""}
                  aria-label={`Expected outcome ${i + 1} hypothesis`}
                  onChange={(e) =>
                    updateOutcome(o.id, { hypothesisIndex: e.target.value ? Number(e.target.value) : null })
                  }
                >
                  <option value="">—</option>
                  {hypotheses.map((_, hi) => (
                    <option key={hi} value={hi + 1}>H{hi + 1}</option>
                  ))}
                  {/* Hypotheses renumber on delete; keep a now-missing ref visible. */}
                  {o.hypothesisIndex && o.hypothesisIndex > hypotheses.length ? (
                    <option value={o.hypothesisIndex}>H{o.hypothesisIndex} (removed)</option>
                  ) : null}
                </select>
                <textarea
                  className={cn(fieldCls, "min-h-[44px] resize-y")}
                  placeholder="e.g. Labelled headlines are rated less accurate."
                  value={o.prediction}
                  maxLength={1000}
                  aria-label={`Expected outcome ${i + 1} prediction`}
                  onChange={(e) => updateOutcome(o.id, { prediction: e.target.value })}
                />
                <button
                  type="button"
                  aria-label={`Remove expected outcome ${i + 1}`}
                  onClick={() => removeOutcome(o.id)}
                  className="mt-1.5 shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-danger-text-on-subtle)]"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={addOutcome}
          className="inline-flex items-center gap-1 self-start rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
        >
          <Plus className="size-4" aria-hidden />
          Add expected outcome
        </button>
      </div>
      ) : null}

      {/* OSF's own questions for the chosen template (ADR-0107). Placed here,
          after the researcher's plan, not opening the page: they answer OSF's
          form, and sit beside the plan fields that ask the same things. */}
      {osfQuestions.data ? (
        <TemplateQuestions
          templateLabel={osfQuestions.data.templateLabel}
          questions={osfQuestions.data.questions}
          answers={templateAnswers}
          onAnswer={(key, value) => {
            setTemplateAnswers((a) => ({ ...a, [key]: value }));
            dirty();
          }}
        />
      ) : null}
      {osfQuestions.isError ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Couldn&rsquo;t load this template&rsquo;s questions from OSF.{" "}
          <button type="button" onClick={() => void osfQuestions.refetch()} className="underline">
            Try again
          </button>
        </p>
      ) : null}

      {/* Filing details — the OSF mechanics, collapsed. None of these are the
          plan the researcher writes; the Field of study governs nothing on
          screen, so it no longer opens the page (owner 2026-07-17). */}
      <details className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3">
        <summary className="cursor-pointer text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-secondary)]">
          Filing details
        </summary>
        <div className="flex flex-col gap-4 pt-3">
          <SubjectPicker
            subjects={osfSubjects}
            selected={osfSubjectIds}
            onChange={(ids) => {
              setOsfSubjectIds(ids);
              dirty();
            }}
          />
          {/* Derived, read-only (ADR-0101). Reports on DATA, not recruitment. */}
          <div className="flex flex-col gap-1">
            <span className={labelCls}>Data collection</span>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded-[var(--radius-sm)] px-2 py-0.5 text-[length:var(--text-small)] font-medium", chip.cls)}>
                {chip.label}
              </span>
              <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                You can only preregister before your first participant response.
              </span>
            </div>
          </div>
        </div>
      </details>

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
          onClick={() =>
            save.mutate({
              studyId,
              overview: {
                abstract,
                hypotheses: hypotheses.filter((h) => h.trim() !== ""),
                replicationNotes,
                sections,
                // Typed plan fields (ADR-0101). `dataCollectionStatus` is never
                // sent — it is derived server-side. Anything omitted here keeps
                // its stored value (setOverview merges).
                // Only ever the explicit choice — undefined is omitted by the Zod
                // schema and setOverview's merge keeps whatever is stored, so an
                // untouched picker never manufactures a decision.
                templateKey: explicitTemplateKey,
                discloseDerivation,
                templateAnswers,
                osfSubjectIds,
                // `source` is never sent — it is derived server-side, like
                // `dataCollectionStatus`. This used to hardcode
                // `source: "researcher"` on all five, which meant the provenance
                // slot ADR-0101 built would be reverted the first time anyone
                // opened Overview and pressed Save (ADR-0106 D4).
                samplingPlan: { text: samplingPlan },
                analysisPlan: { text: analysisPlan },
                variables: variables
                  .filter((v) => v.name.trim() !== "")
                  .map(({ id, name, role, instanceId, notes }) => ({ id, name, role, instanceId, notes })),
                expectedOutcomes: expectedOutcomes
                  .filter((o) => o.prediction.trim() !== "")
                  .map(({ id, hypothesisIndex, prediction }) => ({ id, hypothesisIndex, prediction })),
                // Sent regardless of the current template: a field hidden by a
                // template switch keeps its stored value rather than being wiped.
                originalStudy: { text: originalStudy },
                targetEffect: { text: targetEffect },
                differences: { text: differences },
              },
            })
          }
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
