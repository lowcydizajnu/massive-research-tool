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
import { HypothesisChips } from "@/components/feature/study-record/hypothesis-chips";
import { MarkdownField } from "@/components/feature/study-record/markdown-field";
import { PushToOsfButton } from "@/components/feature/study-record/push-to-osf-button";
import { RecordMarkdown } from "@/components/feature/study-record/record-markdown";
import { PendingButton } from "@/components/ui/pending-button";
import {
  type HypothesisFields,
  type SectionType,
  carriesAuthoredContent,
  isFrozenSection,
  sectionType,
} from "@/lib/study-record/sections";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import type { StudyRecordForEdit } from "@/server/trpc/routers/study-record";

type Instance = { id: string; type: string; title: string; content: string; hidden: boolean; fields: HypothesisFields };

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
      <div className="flex items-center justify-between gap-2">
        {data.finishedAt ? <span /> : (
          <p className="rounded-[var(--radius-md)] bg-[var(--color-warning-subtle)] px-3 py-1.5 text-[length:var(--text-small)] text-[var(--color-warning-text-on-subtle)]">
            Not finished yet — you can compose, but a public record reads best once results have landed.
          </p>
        )}
        <div className="flex shrink-0 items-start gap-2">
          <PushToOsfButton studyId={studyId} />
          <button
            type="button"
            onClick={() => setPreview((v) => !v)}
            className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
          >
            {preview ? "← Back to editing" : "Preview"}
          </button>
        </div>
      </div>

      {preview ? (
        <Preview sections={sections} data={data} abstract={abstract} articleUrl={articleUrl} articleDoi={articleDoi} />
      ) : (
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
                          setSections((arr) => [...arr, { id: ulid(), type: t.key, title: "", content: "", hidden: false, fields: {} }])
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
          <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            {data.visibility === "public" ? (
              <span className="text-[var(--color-success-text-on-subtle)]">Published · public</span>
            ) : (
              "Visible to your workspace"
            )}
          </span>
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
  onPatch: (p: Partial<Instance>) => void;
  onToggleHidden: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: instance.id });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  const label = type?.label ?? instance.type;
  const isBound = type?.group === "bound";
  const inputCls =
    "w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2.5 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

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

/** Read-only inline preview of the current edit state (ADR-0056 — preview before publish). */
function Preview({
  sections, data, abstract, articleUrl, articleDoi,
}: {
  sections: Instance[];
  data: StudyRecordForEdit;
  abstract: string;
  articleUrl: string;
  articleDoi: string;
}) {
  const visible = sections.filter((s) => !s.hidden);
  return (
    <div className="flex flex-col gap-5 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-subtle)] p-5">
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Preview — how the public record will read.</p>
      {visible.map((s) => {
        const heading = s.title?.trim() || sectionType(s.type)?.label || s.type;
        if (s.type === "abstract") {
          return (
            <PreviewSection key={s.id} title={heading}>
              <RecordMarkdown md={abstract} />
              {articleUrl || articleDoi ? (
                <p className="mt-1 text-[length:var(--text-small)]">
                  {articleUrl ? <a href={articleUrl} target="_blank" rel="noreferrer" className="text-[var(--color-primary)] hover:opacity-90">{articleUrl}</a> : null}
                  {articleDoi ? <span className="ml-2 text-[var(--color-text-secondary)]">DOI: {articleDoi}</span> : null}
                </p>
              ) : null}
            </PreviewSection>
          );
        }
        if (s.type === "hypotheses") {
          return (
            <PreviewSection key={s.id} title={heading}>
              <HypothesisChips fields={s.fields} />
              <RecordMarkdown md={s.content} />
            </PreviewSection>
          );
        }
        if (carriesAuthoredContent(s.type)) {
          return <PreviewSection key={s.id} title={heading}><RecordMarkdown md={s.content} /></PreviewSection>;
        }
        // Bound: show the override note + a "from your data" placeholder.
        return (
          <PreviewSection key={s.id} title={heading}>
            <RecordMarkdown md={s.content} />
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{(data.availability[s.type] ?? true) ? "Renders from your data on the public record." : "Auto-hidden until it has data."}</p>
          </PreviewSection>
        );
      })}
    </div>
  );
}

function PreviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 border-t border-[var(--color-border-subtle)] pt-3 first:border-t-0 first:pt-0">
      <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">{title}</h2>
      {children}
    </section>
  );
}
