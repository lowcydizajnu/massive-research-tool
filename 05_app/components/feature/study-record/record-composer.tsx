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
import { ChevronDown, ChevronUp, Eye, EyeOff, GripVertical, Plus, X } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import { ulid } from "ulid";

import { PendingButton } from "@/components/ui/pending-button";
import { sectionType, type SectionType } from "@/lib/study-record/sections";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import type { StudyRecordForEdit } from "@/server/trpc/routers/study-record";

/** A section in the editor: a registry type + a stable id for dnd + optional content/hidden. */
type Instance = { id: string; type: string; content: string; hidden: boolean };

/**
 * Study Record composer (ADR-0054 §41, Slice 2 / study-record.md). Owner edit
 * mode: a single sortable column of section instances + a palette to add more.
 * Reuses the dashboard customize stack — dnd-kit sortable gives **keyboard
 * reordering for free** (the mandatory a11y fallback), and move up/down buttons
 * back it up. Bound sections show a data-preview note (greyed when empty);
 * authored sections edit inline. The sticky footer carries Save + the
 * visibility/publish control (public = publish, gated server-side on a non-empty
 * abstract + public-replicable).
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

type ForEdit = StudyRecordForEdit;

function Editor({ studyId, data, onSaved }: { studyId: string; data: ForEdit; onSaved: () => void }) {
  const [sections, setSections] = useState<Instance[]>(
    data.layout.map((s) => ({ id: ulid(), type: s.type, content: s.content ?? "", hidden: !!s.hidden })),
  );
  const [abstract, setAbstract] = useState(data.abstract ?? "");
  const [articleUrl, setArticleUrl] = useState(data.articleUrl ?? "");
  const [articleDoi, setArticleDoi] = useState(data.articleDoi ?? "");
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const present = useMemo(() => new Set(sections.map((s) => s.type)), [sections]);
  // Palette = registry types not already placed, except `custom` which repeats.
  const addable = data.sectionTypes.filter((t) => t.repeatable || !present.has(t.key));

  const saveLayout = api.studyRecord.saveLayout.useMutation();
  const saveAuthored = api.studyRecord.saveAuthored.useMutation();
  const setVisibility = api.studyRecord.setVisibility.useMutation();
  const busy = saveLayout.isPending || saveAuthored.isPending || setVisibility.isPending;

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
      layout: sections.map((s) => ({ type: s.type, content: s.content, hidden: s.hidden })),
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
      {data.finishedAt ? null : (
        <p className="rounded-[var(--radius-md)] bg-[var(--color-warning-subtle)] px-3 py-2 text-[length:var(--text-small)] text-[var(--color-warning-text-on-subtle)]">
          This study isn’t finished yet — you can compose the record, but publishing a public record reads best once
          results have landed.
        </p>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-2">
            {sections.map((s, i) => (
              <SortableSection
                key={s.id}
                instance={s}
                type={sectionType(s.type)}
                available={data.availability[s.type] ?? true}
                first={i === 0}
                last={i === sections.length - 1}
                abstract={abstract}
                articleUrl={articleUrl}
                articleDoi={articleDoi}
                onAbstract={setAbstract}
                onArticleUrl={setArticleUrl}
                onArticleDoi={setArticleDoi}
                onContent={(content) => setSections((arr) => arr.map((x) => (x.id === s.id ? { ...x, content } : x)))}
                onToggleHidden={() =>
                  setSections((arr) => arr.map((x) => (x.id === s.id ? { ...x, hidden: !x.hidden } : x)))
                }
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

      {/* Palette — add a section type (bound = From your data, authored = Write your own) */}
      {addable.length > 0 ? (
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
                          setSections((arr) => [...arr, { id: ulid(), type: t.key, content: "", hidden: false }])
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
        <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
          {error}
        </p>
      ) : null}

      {/* Sticky footer: Save + visibility / publish */}
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
              <PendingButton
                variant="secondary"
                pending={setVisibility.isPending}
                idleLabel="Unpublish"
                pendingLabel="Updating…"
                onClick={() => void publish("workspace")}
                disabled={busy}
              />
            ) : (
              <PendingButton
                pending={setVisibility.isPending}
                idleLabel="Publish record"
                pendingLabel="Publishing…"
                onClick={() => void publish("public")}
                disabled={busy}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SortableSection({
  instance,
  type,
  available,
  first,
  last,
  abstract,
  articleUrl,
  articleDoi,
  onAbstract,
  onArticleUrl,
  onArticleDoi,
  onContent,
  onToggleHidden,
  onRemove,
  onMove,
}: {
  instance: Instance;
  type: SectionType | undefined;
  available: boolean;
  first: boolean;
  last: boolean;
  abstract: string;
  articleUrl: string;
  articleDoi: string;
  onAbstract: (v: string) => void;
  onArticleUrl: (v: string) => void;
  onArticleDoi: (v: string) => void;
  onContent: (v: string) => void;
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
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag ${label} to reorder`}
          className="cursor-grab text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
        <span className="flex-1 truncate text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
          {label}
          {isBound ? <span className="ml-2 text-[length:var(--text-small)] font-normal text-[var(--color-text-muted)]">from your data</span> : null}
        </span>
        <button type="button" onClick={() => onMove(-1)} disabled={first} aria-label={`Move ${label} up`} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-30">
          <ChevronUp className="size-4" aria-hidden />
        </button>
        <button type="button" onClick={() => onMove(1)} disabled={last} aria-label={`Move ${label} down`} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-30">
          <ChevronDown className="size-4" aria-hidden />
        </button>
        <button type="button" onClick={onToggleHidden} aria-pressed={instance.hidden} aria-label={instance.hidden ? `Show ${label}` : `Hide ${label}`} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)]">
          {instance.hidden ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
        <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)]">
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="mt-2 pl-6">
        {isBound ? (
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            {available
              ? "Renders automatically from this study’s data."
              : "Nothing to show yet — this section is auto-hidden on the public record until it has data."}
          </p>
        ) : instance.type === "abstract" ? (
          <textarea
            value={abstract}
            onChange={(e) => onAbstract(e.target.value)}
            rows={4}
            maxLength={4000}
            placeholder="A plain-language summary of what you found. Required to publish a public record."
            className={inputCls}
          />
        ) : instance.type === "article-link" ? (
          <div className="flex flex-col gap-2">
            <input value={articleUrl} onChange={(e) => onArticleUrl(e.target.value)} placeholder="Journal URL (https://…)" className={inputCls} />
            <input value={articleDoi} onChange={(e) => onArticleDoi(e.target.value)} placeholder="DOI (10.…)" className={inputCls} />
          </div>
        ) : (
          <textarea
            value={instance.content}
            onChange={(e) => onContent(e.target.value)}
            rows={instance.type === "narrative" ? 5 : 3}
            maxLength={20000}
            placeholder={instance.type === "narrative" ? "Your interpretation of the findings…" : "Write this section…"}
            className={inputCls}
          />
        )}
      </div>
    </li>
  );
}
