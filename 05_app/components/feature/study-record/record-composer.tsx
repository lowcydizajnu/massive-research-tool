"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, Eye, EyeOff, GripVertical, Lock, Plus, X } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import { ulid } from "ulid";

import { DataPublishControl } from "@/components/feature/study-record/data-publish-control";
import { MarkdownField } from "@/components/feature/study-record/markdown-field";
import { FindabilityPanel } from "@/components/feature/study-record/findability-panel";
import { LinkedOutputsPanel } from "@/components/feature/study-record/linked-outputs-panel";
import { OsfMaterialsPanel } from "@/components/feature/study-record/osf-materials-panel";
import { PushToOsfButton } from "@/components/feature/study-record/push-to-osf-button";
import { RecordSections } from "@/components/feature/study-record/record-sections";
import { PendingButton } from "@/components/ui/pending-button";
import {
  type ClaimBinding,
  type HypothesisFields,
  type SectionType,
  isFrozenSection,
  sectionType,
} from "@/lib/study-record/sections";
import { LICENSES, type LicenseId } from "@/lib/licenses";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import type { StudyRecordForEdit } from "@/server/trpc/routers/study-record";

type Instance = {
  id: string;
  type: string;
  title: string;
  content: string;
  hidden: boolean;
  fields: HypothesisFields;
  /** Plan↔report binding (ADR-0102); undefined = unbound = Exploratory. */
  claim?: ClaimBinding;
};

type PreregPlanOption = { versionId: string; versionNumber: number; filedAt: string; hypotheses: string[] };

/** Sentinel for "the claim's existing binding to an earlier filing" — not a real
 *  hypothesis index, and never written to a claim. */
const OLDER_BINDING = "__older";

/** Shared field styling — module-scope so ClaimBinder and SortableSection agree. */
const inputCls =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2.5 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

/**
 * Bind a reported claim to a preregistered hypothesis (ADR-0102).
 *
 * This select is the ONLY path to the word "Preregistered". There is deliberately
 * no control that marks a claim preregistered directly: you point at a frozen
 * hypothesis, or you don't get to say it. The downgrade checkbox is the only
 * override, and it only ever weakens the claim — a plan-matching hypothesis
 * analysed a way the plan didn't specify is a real and honest case.
 *
 * Absent entirely when the study has no preregistration: there is nothing to
 * point at, so a disabled control with a tooltip would just be noise.
 */
function ClaimBinder({
  claim,
  plans,
  onPatch,
}: {
  claim?: ClaimBinding;
  plans: PreregPlanOption[];
  onPatch: (p: Partial<Instance>) => void;
}) {
  if (!plans.length) return null;
  // Bind against the NEWEST filing — the operative plan.
  const plan = plans[plans.length - 1];
  const bound = claim?.planVersionId === plan.versionId ? claim : undefined;
  // A binding to an older filing still resolves; surface it rather than hide it.
  const older = claim && claim.planVersionId !== plan.versionId
    ? plans.find((p) => p.versionId === claim.planVersionId)
    : undefined;

  // A filing that states no hypotheses gives the select nothing to offer. Render
  // the reason instead of a dropdown whose only option is "not preregistered" —
  // that reads as a choice the author declined to make, when in fact the plan
  // never named anything to point at. The plan is frozen, so the only honest
  // route to a binding is to state hypotheses and file an amendment; say that
  // rather than implying the record is withholding a shortcut.
  if (!older && !plan.hypotheses.length) {
    return (
      <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-2.5 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Preregistration v{plan.versionNumber} states no hypotheses, so there is nothing to bind to and this claim
        reports as exploratory. Hypotheses are written in Overview and freeze when you preregister — to bind a claim,
        state them there and file an amendment.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-2.5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-0.5">
          <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Tests</span>
          <select
            className={inputCls}
            aria-label="Which preregistered hypothesis this claim tests"
            // A binding to an earlier filing must show as itself. Falling back to
            // the empty option displayed "not preregistered" as the CURRENT choice
            // while the record published "Preregistered" for that very claim — the
            // composer contradicting the record it previews.
            value={older ? OLDER_BINDING : bound ? String(bound.hypothesisIndex) : ""}
            onChange={(e) => {
              const v = e.target.value;
              // Re-picking the existing older binding is a no-op, not a re-bind:
              // the version is pinned (ADR-0102 D2) and silently re-pointing it at
              // the newest plan would change what the claim cites.
              if (v === OLDER_BINDING) return;
              onPatch({
                claim: v
                  ? { planVersionId: plan.versionId, hypothesisIndex: Number(v), exploratoryOverride: claim?.exploratoryOverride }
                  : undefined,
              });
            }}
          >
            {/* Names the outcome the record actually renders. "Not preregistered"
                is a state the product never displays, and the Vocabulary table
                rejects framing the honest default as a lack. */}
            <option value="">Exploratory — not bound to a hypothesis</option>
            {older ? (
              <option value={OLDER_BINDING}>
                H{claim!.hypothesisIndex} of v{older.versionNumber} (earlier filing)
              </option>
            ) : null}
            {plan.hypotheses.map((h, i) => (
              <option key={i} value={i + 1}>
                H{i + 1} — {h.length > 60 ? `${h.slice(0, 60)}…` : h}
              </option>
            ))}
          </select>
        </label>
        {claim ? (
          <label className="flex items-center gap-1.5 pb-2">
            <input
              type="checkbox"
              checked={!!claim.exploratoryOverride}
              onChange={(e) => onPatch({ claim: { ...claim, exploratoryOverride: e.target.checked || undefined } })}
            />
            <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
              Report as exploratory anyway
            </span>
          </label>
        ) : null}
      </div>
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        {older
          ? `Bound to H${claim!.hypothesisIndex} of the earlier preregistration v${older.versionNumber} — still valid; re-pick to bind to v${plan.versionNumber}.`
          : claim?.exploratoryOverride
            ? "Reported as exploratory — the record won't claim this was preregistered."
            : bound
              ? `The record will show "Preregistered" and cite H${bound.hypothesisIndex} of v${plan.versionNumber}.`
              : "Unbound claims are reported as exploratory — that's the honest default, not a penalty."}
      </p>
    </div>
  );
}

const HYPO_FIELDS: { key: keyof HypothesisFields; label: string; placeholder: string }[] = [
  { key: "effectType", label: "Effect", placeholder: "difference / correlation / interaction" },
  { key: "direction", label: "Direction", placeholder: "positive / negative / two-sided" },
  { key: "statisticKind", label: "Statistic", placeholder: "p / r / d / β / BF" },
  { key: "statisticValue", label: "Value", placeholder: "p < .001" },
  { key: "analysis", label: "Analysis", placeholder: "t-test / ANOVA / regression" },
];

/**
 * Study Record composer (ADR-0056). Owner edit mode: a sortable column of
 * section instances + a palette. Every section is editable — bound sections seed
 * from data and accept a title/content override; preregistration is locked once
 * preregistered. Authored content is Markdown (MarkdownField). Hypotheses carry
 * optional structured fields. A Preview toggle renders the read-only record.
 */
export function RecordComposer({ studyId }: { studyId: string }) {
  const utils = api.useUtils();
  const rec = api.studyRecord.getForEdit.useQuery({ studyId });

  if (rec.isLoading) {
    return <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading record…</p>;
  }
  if (rec.isError || !rec.data) {
    return (
      <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
        Couldn’t load this record. {rec.error?.message}
      </p>
    );
  }
  return <Editor key={studyId} studyId={studyId} data={rec.data} onSaved={() => void utils.studyRecord.getForEdit.invalidate({ studyId })} />;
}

function Editor({ studyId, data, onSaved }: { studyId: string; data: StudyRecordForEdit; onSaved: () => void }) {
  const [sections, setSections] = useState<Instance[]>(
    data.layout.map((s) => ({
      id: ulid(),
      type: s.type,
      title: s.title ?? "",
      content: s.content ?? "",
      hidden: !!s.hidden,
      fields: s.fields ?? {},
      claim: s.claim,
    })),
  );
  const [abstract, setAbstract] = useState(data.abstract ?? "");
  const [articleUrl, setArticleUrl] = useState(data.articleUrl ?? "");
  const [articleDoi, setArticleDoi] = useState(data.articleDoi ?? "");
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const present = useMemo(() => new Set(sections.map((s) => s.type)), [sections]);
  const addable = data.sectionTypes.filter((t) => t.repeatable || !present.has(t.key));

  const saveLayout = api.studyRecord.saveLayout.useMutation();
  const saveAuthored = api.studyRecord.saveAuthored.useMutation();
  const setVisibility = api.studyRecord.setVisibility.useMutation();
  const setLicense = api.studies.setLicense.useMutation({ onSuccess: onSaved });
  const lookupCitation = api.studyRecord.lookupCitation.useMutation();
  const [citeNote, setCiteNote] = useState<string | null>(null);
  const busy = saveLayout.isPending || saveAuthored.isPending || setVisibility.isPending;

  const importDoi = async () => {
    setError(null);
    setCiteNote(null);
    if (!articleDoi.trim()) {
      setError("Enter a DOI to import.");
      return;
    }
    const meta = await lookupCitation.mutateAsync({ doi: articleDoi });
    if (!meta) {
      setError("Couldn’t find that DOI — enter the details manually.");
      return;
    }
    setArticleDoi(meta.doi);
    if (meta.url) setArticleUrl(meta.url);
    setCiteNote(meta.citation + (meta.citedByCount != null ? ` · cited by ${meta.citedByCount}` : ""));
  };

  const patch = (id: string, p: Partial<Instance>) => setSections((arr) => arr.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const move = (id: string, dir: -1 | 1) =>
    setSections((arr) => {
      const i = arr.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return arr;
      const next = [...arr];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setSections((arr) => {
      const from = arr.findIndex((s) => s.id === active.id);
      const to = arr.findIndex((s) => s.id === over.id);
      if (from < 0 || to < 0) return arr;
      const next = [...arr];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const persist = async () => {
    setError(null);
    await saveAuthored.mutateAsync({
      studyId,
      abstract: abstract.trim() || null,
      articleUrl: articleUrl.trim() || null,
      articleDoi: articleDoi.trim() || null,
    });
    await saveLayout.mutateAsync({
      studyId,
      layout: sections.map((s) => ({
        type: s.type,
        title: s.title || undefined,
        content: s.content || undefined,
        hidden: s.hidden,
        fields: s.type === "hypotheses" ? s.fields : undefined,
        claim: s.type === "hypotheses" ? s.claim : undefined,
      })),
    });
    onSaved();
  };

  const publish = async (visibility: "workspace" | "public") => {
    setError(null);
    try {
      await persist();
      await setVisibility.mutateAsync({ studyId, visibility });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div className="flex flex-col gap-3">
        {data.finishedAt ? null : (
          <p className="rounded-[var(--radius-md)] bg-[var(--color-warning-subtle)] px-3 py-1.5 text-[length:var(--text-small)] text-[var(--color-warning-text-on-subtle)]">
            Not finished yet — you can compose, but a public record reads best once results have landed.
          </p>
        )}
        <div className="flex flex-wrap items-start justify-end gap-2">
          <PushToOsfButton studyId={studyId} />
          <button
            type="button"
            disabled={saveLayout.isPending || saveAuthored.isPending}
            onClick={async () => {
              if (preview) { setPreview(false); return; }
              // Save first so the preview reflects exactly what would publish (ADR-0056 C).
              setError(null);
              try {
                await persist();
                setPreview(true);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Couldn’t save before preview.");
              }
            }}
            className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-60"
          >
            {preview ? "← Back to editing" : "Save & preview"}
          </button>
        </div>
      </div>

      {preview ? (
        <RecordPreviewPane studyId={studyId} />
      ) : (
        <>
          <OsfMaterialsPanel studyId={studyId} />
          <LinkedOutputsPanel studyId={studyId} />
          <FindabilityPanel studyId={studyId} language={data.language} funders={data.funders} onSaved={onSaved} />
        </>
      )}

      {preview ? null : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-2">
              {sections.map((s, i) => (
                <SortableSection
                  key={s.id}
                  instance={s}
                  type={sectionType(s.type)}
                  available={data.availability[s.type] ?? true}
                  frozen={isFrozenSection(s.type, data.hasPreregistration)}
                  studyId={studyId}
                  dataState={{ published: data.dataPublished, columns: data.dataColumns, rowCount: data.dataRowCount }}
                  first={i === 0}
                  last={i === sections.length - 1}
                  abstract={abstract}
                  articleUrl={articleUrl}
                  articleDoi={articleDoi}
                  onAbstract={setAbstract}
                  onArticleUrl={setArticleUrl}
                  onArticleDoi={setArticleDoi}
                  onImportDoi={importDoi}
                  importPending={lookupCitation.isPending}
                  citeNote={citeNote}
                  preregPlans={data.preregPlans}
                  onPatch={(p) => patch(s.id, p)}
                  onToggleHidden={() => patch(s.id, { hidden: !s.hidden })}
                  onRemove={() => setSections((arr) => arr.filter((x) => x.id !== s.id))}
                  onMove={(dir) => move(s.id, dir)}
                />
              ))}
              {sections.length === 0 ? (
                <li className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-6 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                  No sections yet — add some from the palette below.
                </li>
              ) : null}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {!preview && addable.length > 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-subtle)] p-3">
          <p className="mb-2 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">Add a section</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
            {(["bound", "authored"] as const).map((group) => {
              const items = addable.filter((t) => t.group === group);
              if (!items.length) return null;
              return (
                <div key={group} className="flex flex-col gap-1">
                  <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                    {group === "bound" ? "From your data" : "Write your own"}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        title={t.description}
                        onClick={() =>
                          setSections((arr) => [...arr, { id: ulid(), type: t.key, title: "", content: "", hidden: false, fields: {}, claim: undefined }])
                        }
                        className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
                      >
                        <Plus className="size-3.5" aria-hidden /> {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">{error}</p>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            <span>
              {data.visibility === "public" ? (
                <span className="text-[var(--color-success-text-on-subtle)]">Published · public</span>
              ) : (
                "Visible to your workspace"
              )}
            </span>
            {/* Reuse license (ADR-0100) — set at the publish moment. */}
            <label className="flex items-center gap-1.5">
              <span className="text-[var(--color-text-muted)]">License</span>
              <select
                value={data.license}
                onChange={(e) => setLicense.mutate({ studyId, license: e.target.value as LicenseId })}
                disabled={setLicense.isPending}
                aria-label="Reuse license"
                className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-1.5 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-primary)]"
              >
                {LICENSES.map((l) => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <PendingButton
              variant="secondary"
              pending={saveLayout.isPending || saveAuthored.isPending}
              idleLabel="Save"
              pendingLabel="Saving…"
              onClick={() => {
                setError(null);
                persist().catch((e) => setError(e instanceof Error ? e.message : "Couldn’t save."));
              }}
            />
            {data.visibility === "public" ? (
              <PendingButton variant="secondary" pending={setVisibility.isPending} idleLabel="Unpublish" pendingLabel="Updating…" onClick={() => void publish("workspace")} disabled={busy} />
            ) : (
              <PendingButton pending={setVisibility.isPending} idleLabel="Publish record" pendingLabel="Publishing…" onClick={() => void publish("public")} disabled={busy} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SortableSection({
  instance, type, available, frozen, first, last, studyId, dataState,
  abstract, articleUrl, articleDoi, onAbstract, onArticleUrl, onArticleDoi,
  onImportDoi, importPending, citeNote,
  preregPlans,
  onPatch, onToggleHidden, onRemove, onMove,
}: {
  instance: Instance;
  type: SectionType | undefined;
  available: boolean;
  frozen: boolean;
  first: boolean;
  last: boolean;
  studyId: string;
  dataState: { published: boolean; columns: string[]; rowCount: number };
  abstract: string;
  articleUrl: string;
  articleDoi: string;
  onAbstract: (v: string) => void;
  onArticleUrl: (v: string) => void;
  onArticleDoi: (v: string) => void;
  onImportDoi?: () => void;
  importPending?: boolean;
  citeNote?: string | null;
  preregPlans: PreregPlanOption[];
  onPatch: (p: Partial<Instance>) => void;
  onToggleHidden: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: instance.id });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  const label = type?.label ?? instance.type;
  const isBound = type?.group === "bound";

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-3",
        instance.hidden && "opacity-60",
      )}
    >
      <div className="flex items-center gap-2">
        <button type="button" {...attributes} {...listeners} aria-label={`Drag ${label} to reorder`} className="cursor-grab text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]">
          <GripVertical className="size-4" aria-hidden />
        </button>
        {/* Editable section title (ADR-0056); frozen sections keep their label. */}
        {frozen ? (
          <span className="flex flex-1 items-center gap-1.5 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
            {label} <Lock className="size-3.5 text-[var(--color-text-muted)]" aria-hidden />
            <span className="text-[length:var(--text-small)] font-normal text-[var(--color-text-muted)]">preregistered · locked</span>
          </span>
        ) : (
          <input
            value={instance.title}
            onChange={(e) => onPatch({ title: e.target.value })}
            placeholder={label}
            aria-label={`${label} title`}
            className="min-w-0 flex-1 rounded-[var(--radius-sm)] bg-transparent px-1 py-0.5 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)] outline-none hover:bg-[var(--color-surface-subtle)] focus:bg-[var(--color-surface-subtle)]"
          />
        )}
        {isBound ? <span className="shrink-0 text-[length:var(--text-small)] text-[var(--color-text-muted)]">from your data</span> : null}
        <button type="button" onClick={() => onMove(-1)} disabled={first} aria-label={`Move ${label} up`} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-30"><ChevronUp className="size-4" aria-hidden /></button>
        <button type="button" onClick={() => onMove(1)} disabled={last} aria-label={`Move ${label} down`} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-30"><ChevronDown className="size-4" aria-hidden /></button>
        <button type="button" onClick={onToggleHidden} aria-pressed={instance.hidden} aria-label={instance.hidden ? `Show ${label}` : `Hide ${label}`} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)]">{instance.hidden ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}</button>
        <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)]"><X className="size-4" aria-hidden /></button>
      </div>

      <div className="mt-2 pl-6">
        {instance.type === "abstract" ? (
          <div className="flex flex-col gap-2">
            <MarkdownField value={abstract} onChange={onAbstract} rows={4} ariaLabel="Abstract" placeholder="A plain-language summary of what you found. Required to publish a public record." />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input value={articleUrl} onChange={(e) => onArticleUrl(e.target.value)} placeholder="Article URL (https://…)" className={inputCls} />
              <input value={articleDoi} onChange={(e) => onArticleDoi(e.target.value)} placeholder="DOI (10.…)" className={inputCls} />
              <button
                type="button"
                onClick={onImportDoi}
                disabled={importPending}
                className="shrink-0 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-60"
              >
                {importPending ? "Importing…" : "Import from DOI"}
              </button>
            </div>
            {citeNote ? (
              <p className="rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)] px-2 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{citeNote}</p>
            ) : null}
          </div>
        ) : instance.type === "hypotheses" ? (
          <div className="flex flex-col gap-2">
            <ClaimBinder claim={instance.claim} plans={preregPlans} onPatch={onPatch} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {HYPO_FIELDS.map((f) => (
                <label key={f.key} className="flex flex-col gap-0.5">
                  <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{f.label}</span>
                  <input
                    value={instance.fields[f.key] ?? ""}
                    onChange={(e) => onPatch({ fields: { ...instance.fields, [f.key]: e.target.value } })}
                    placeholder={f.placeholder}
                    className={inputCls}
                  />
                </label>
              ))}
            </div>
            <MarkdownField value={instance.content} onChange={(v) => onPatch({ content: v })} rows={3} ariaLabel="Hypothesis detail" placeholder="State the hypothesis and what you found…" />
          </div>
        ) : frozen ? (
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">The preregistered plan is frozen (ADR-0044) — it renders from the registered version and can’t be edited.</p>
        ) : isBound ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              {available ? "Seeds automatically from your data. Add notes below to override or annotate." : "Nothing to show yet — auto-hidden on the public record until it has data."}
            </p>
            <MarkdownField value={instance.content} onChange={(v) => onPatch({ content: v })} rows={3} ariaLabel={`${label} notes`} placeholder="Optional notes shown above the auto-resolved content…" />
            {instance.type === "data" ? (
              <DataPublishControl
                studyId={studyId}
                initialPublished={dataState.published}
                initialColumns={dataState.columns}
                initialRowCount={dataState.rowCount}
              />
            ) : null}
          </div>
        ) : (
          <MarkdownField value={instance.content} onChange={(v) => onPatch({ content: v })} rows={instance.type === "narrative" ? 5 : 3} ariaLabel={label} placeholder="Write this section…" />
        )}
      </div>
    </li>
  );
}

/**
 * Faithful preview (ADR-0056 C): fetches the owner record-preview and renders it
 * through the SAME `<RecordSections>` the public page uses, so preview === what
 * publishes. The toggle saves first, so this reflects the saved state.
 */
function RecordPreviewPane({ studyId }: { studyId: string }) {
  const preview = api.studies.getRecordPreview.useQuery({ studyId });
  if (preview.isLoading) {
    return <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading preview…</p>;
  }
  if (preview.isError || !preview.data) {
    return (
      <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
        Couldn’t load the preview. {preview.error?.message}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-5 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-subtle)] p-5">
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Preview — exactly how the public record will read.</p>
      <RecordSections detail={preview.data} />
    </div>
  );
}
