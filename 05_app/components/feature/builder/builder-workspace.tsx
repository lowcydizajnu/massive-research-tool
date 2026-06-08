"use client";

import { GripVertical, Plus, Redo2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";

import { SortableList } from "@/components/feature/whiteboard/sortable-list";
import { useBlockHistory } from "@/lib/whiteboard/use-block-history";
import { regroupAfterMove } from "@/lib/whiteboard/screens";
import {
  conditionWithSources,
  newlyBrokenByReorder,
  summarizeClause,
  summarizeCondition,
} from "@/lib/whiteboard/conditions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { StageTabs } from "@/components/chrome/stage-tabs";
import { ConditionBuilder } from "@/components/feature/whiteboard/condition-builder";
import { ModeToggle } from "./mode-toggle";
import { EditableStudyTitle } from "@/components/feature/editable-study-title";
import { FollowButton } from "@/components/feature/follow/follow-button";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import type { StudyBlock, StudyDetail } from "@/server/trpc/routers/studies";

import { BlockVisibilityField } from "./block-visibility-field";
import { ConditionsSection } from "./conditions-section";
import { ConfigureForm } from "./configure-form";
import { ModulePicker } from "./module-picker";
import { ForkableControl, ReplicateButton, ReplicationsPanel } from "./replications-panel";
import { SaveVersionDialog } from "./save-version-dialog";
import { TagsSection } from "./tags-section";
import { VersionsPanel } from "./versions-panel";

/**
 * Builder mode — the interactive three-zone body (build-stage-builder-mode.md).
 * Owns block selection so the work surface (block list + picker) and the right
 * panel (Details ↔ Configure) stay in sync. Reads via api.studies.get with the
 * RSC-fetched study as initialData; block mutations invalidate it to refetch.
 */
const STAGE_LABEL: Record<StudyDetail["stage"], string> = {
  draft: "draft",
  preregistered: "preregistered",
  published: "published",
};

function formatEdited(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

const tabActiveCls =
  "rounded-[var(--radius-sm)] bg-[var(--color-primary-subtle)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-primary-text-on-subtle)]";
const tabIdleCls =
  "rounded-[var(--radius-sm)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]";

/** A not-yet-built right-panel tab (shown for IA legibility, inert). */
function TabSoon({ label }: { label: string }) {
  return (
    <span
      role="tab"
      aria-disabled="true"
      title="Coming soon"
      className="cursor-default px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-muted)] opacity-60"
    >
      {label}
    </span>
  );
}

export function BuilderWorkspace({
  study: initial,
  currentUserId = null,
}: {
  study: StudyDetail;
  currentUserId?: string | null;
}) {
  const utils = api.useUtils();
  const { data } = api.studies.get.useQuery({ id: initial.id }, { initialData: initial });
  const study = data ?? initial;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<"details" | "replications" | "versions">("details");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const invalidate = () => utils.studies.get.invalidate({ id: study.id });
  const addBlock = api.studies.addBlock.useMutation({
    onSuccess: ({ instanceId }) => {
      setSelectedId(instanceId);
      setPickerOpen(false);
      void invalidate();
    },
  });
  const removeBlock = api.studies.removeBlock.useMutation({ onSuccess: () => void invalidate() });
  const updateConfig = api.studies.updateBlockConfig.useMutation({
    onSuccess: () => void invalidate(),
  });
  const renameBlock = api.studies.setBlockTitle.useMutation({ onSuccess: () => void invalidate() });
  const setCondition = api.studies.setBlockCondition.useMutation({ onSuccess: () => void invalidate() });
  // Bump on a restore (undo/redo) so the right-panel editors re-seed (they hold
  // local state keyed by block id, which a restore doesn't change). Normal edits
  // don't bump it, so typing isn't interrupted.
  const [panelEpoch, setPanelEpoch] = useState(0);
  const setBlocksMut = api.studies.setBlocks.useMutation({
    onSuccess: () => {
      void invalidate();
      setPanelEpoch((e) => e + 1);
    },
  });
  const { canUndo, canRedo, undo, redo } = useBlockHistory(study.id, study.blocks, (blocks) =>
    setBlocksMut.mutate({ studyId: study.id, blocks }),
  );
  const setGroupsMut = api.studies.setGroups.useMutation({ onSuccess: () => void invalidate() });

  // Convert the read-shaped StudyBlock back to the write (BlockInstance) shape.
  const toInstance = (b: StudyBlock, groupId: string | null) => ({
    instanceId: b.instanceId,
    source: b.source,
    key: b.key,
    version: b.version,
    config: b.config,
    ...(b.title ? { title: b.title } : {}),
    ...(b.showIfCondition.length ? { visibility: { showIfCondition: b.showIfCondition } } : {}),
    ...(b.branchRules.length ? { branchRules: b.branchRules } : {}),
    ...(b.showIf ? { showIf: b.showIf } : {}),
    ...(groupId ? { groupId } : {}),
  });
  /** Persist a groupId override for one block + recompute the groups[] metadata. */
  const persistGroupChange = (changedId: string, newGroupId: string | null, newGroup?: { id: string; title: string }) => {
    const blocks = study.blocks.map((b) =>
      toInstance(b, b.instanceId === changedId ? newGroupId : b.groupId),
    );
    const usedIds = new Set(blocks.map((b) => b.groupId).filter(Boolean) as string[]);
    const groups = [
      ...study.groups.filter((g) => usedIds.has(g.id)),
      ...(newGroup && usedIds.has(newGroup.id) && !study.groups.some((g) => g.id === newGroup.id) ? [newGroup] : []),
    ];
    setGroupsMut.mutate({ studyId: study.id, blocks, groups });
  };
  const groupWithAbove = (i: number) => {
    const above = study.blocks[i - 1];
    const me = study.blocks[i];
    if (!above || !me) return;
    if (above.groupId) {
      persistGroupChange(me.instanceId, above.groupId);
    } else {
      const id = crypto.randomUUID();
      // Group both the block above (start the run) and this one.
      const blocks = study.blocks.map((b) =>
        toInstance(b, b.instanceId === above.instanceId || b.instanceId === me.instanceId ? id : b.groupId),
      );
      setGroupsMut.mutate({ studyId: study.id, blocks, groups: [...study.groups, { id, title: "Group" }] });
    }
  };
  const ungroup = (id: string) => persistGroupChange(id, null);
  const renameGroup = (groupId: string, title: string) => {
    const blocks = study.blocks.map((b) => toInstance(b, b.groupId));
    const groups = study.groups.map((g) => (g.id === groupId ? { ...g, title } : g));
    setGroupsMut.mutate({ studyId: study.id, blocks, groups });
  };
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleCollapse = (groupId: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  const [pendingReorder, setPendingReorder] = useState<{
    blocks: ReturnType<typeof toInstance>[];
    groups: StudyDetail["groups"];
    items: string[];
  } | null>(null);
  const nameOf = (id: string) => {
    const b = study.blocks.find((x) => x.instanceId === id);
    return b ? b.title?.trim() || b.name : id;
  };
  // A drag-reorder also recomputes group membership from drop neighbors + keeps
  // groups contiguous (ADR-0028 #3+#8), then persists blocks + groups together.
  const requestReorder = (order: string[], movedId: string) => {
    const byId = new Map(study.blocks.map((b) => [b.instanceId, b]));
    const minimal = order.map((id) => ({ instanceId: id, groupId: byId.get(id)?.groupId ?? null }));
    const regrouped = regroupAfterMove(minimal, movedId);
    const orderedStudyBlocks = regrouped.map((r) => ({ ...byId.get(r.instanceId)!, groupId: r.groupId }));
    const broken = newlyBrokenByReorder(study.blocks, orderedStudyBlocks);
    const blocks = regrouped.map((r) => toInstance(byId.get(r.instanceId)!, r.groupId));
    const usedIds = new Set(blocks.map((b) => b.groupId).filter(Boolean) as string[]);
    const groups = study.groups.filter((g) => usedIds.has(g.id));
    if (broken.length === 0) {
      setGroupsMut.mutate({ studyId: study.id, blocks, groups });
      return;
    }
    setPendingReorder({
      blocks,
      groups,
      items: broken.map((b) => `"${nameOf(b.targetId)}": ${summarizeClause(b.clause, nameOf)}`),
    });
  };

  const selected = study.blocks.find((b) => b.instanceId === selectedId) ?? null;

  useEffect(() => {
    if (!savedMsg) return;
    const t = setTimeout(() => setSavedMsg(null), 3000);
    return () => clearTimeout(t);
  }, [savedMsg]);

  // Cmd/Ctrl+S → save as a named version (autosave already keeps the draft; this
  // is the conscious save). V1.12 H.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setSaveOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <main className="flex min-w-0 flex-1 flex-col gap-3">
        <StageTabs studyId={study.id} />

        <div className="flex flex-1 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
          {/* Title row */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <EditableStudyTitle studyId={study.id} initialTitle={study.title} />
              <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                {/* Autosave tip is the unnumbered Draft (ADR-0012 amendment); v1+ are conscious saves. */}
                {study.versionNumber > 0 ? `v${study.versionNumber}` : "Draft"} ·{" "}
                {STAGE_LABEL[study.stage]} · Edited {formatEdited(study.lastEditedAt)}
                {study.isReplication ? " · replicating an upstream study" : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={undo}
                disabled={!canUndo || setBlocksMut.isPending}
                title="Undo last change"
                aria-label="Undo last change"
                className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-40"
              >
                <Undo2 className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={!canRedo || setBlocksMut.isPending}
                title="Redo"
                aria-label="Redo last undone change"
                className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-40"
              >
                <Redo2 className="size-4" aria-hidden />
              </button>
              <ModeToggle studyId={study.id} mode="builder" />
              <button
                type="button"
                onClick={() => setSaveOpen(true)}
                className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-[length:var(--text-body-emphasis)] font-medium text-white transition-opacity hover:opacity-90 active:opacity-80"
              >
                Save
              </button>
            </div>
          </div>

          {/* Blocks */}
          <section className="flex flex-col gap-3">
            <h2 className="border-b border-[var(--color-border-subtle)] pb-1 font-serif text-[17px] font-medium text-[var(--color-text-primary)]">
              Blocks
            </h2>

            {study.blocks.length === 0 ? (
              <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-6 text-center text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
                No blocks yet. Add your first to start building.
              </p>
            ) : (
              <SortableList
                ids={study.blocks.map((b) => b.instanceId)}
                onReorder={requestReorder}
                ariaLabel="Study blocks"
                className="flex flex-col gap-2"
              >
                {(id, handle) => {
                  const i = study.blocks.findIndex((b) => b.instanceId === id);
                  const b = study.blocks[i];
                  if (!b) return null;
                  const prev = study.blocks[i - 1];
                  const grouped = !!b.groupId;
                  const groupStart = grouped && (!prev || prev.groupId !== b.groupId);
                  const group = grouped ? study.groups.find((g) => g.id === b.groupId) : null;
                  const isCollapsed = grouped && collapsedGroups.has(b.groupId!);
                  const memberCount = grouped ? study.blocks.filter((x) => x.groupId === b.groupId).length : 0;
                  // Collapsed: render non-first members as a thin one-liner (kept in
                  // the DnD list so reordering still works).
                  if (grouped && !groupStart && isCollapsed) {
                    return (
                      <div className="flex items-center gap-1 border-l-2 border-[var(--color-primary)] pl-2">
                        <span
                          ref={handle.ref}
                          {...handle.attributes}
                          {...handle.listeners}
                          aria-label="Drag to reorder"
                          className="flex shrink-0 cursor-grab touch-none items-center rounded-[var(--radius-md)] px-1 text-[var(--color-text-muted)] active:cursor-grabbing"
                        >
                          <GripVertical className="size-3.5" aria-hidden />
                        </span>
                        <span className="truncate text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                          {b.title?.trim() || b.name}
                        </span>
                      </div>
                    );
                  }
                  return (
                    <div className="flex flex-col gap-2">
                      {groupStart ? (
                        <div className="flex items-center gap-2 pl-7">
                          <button
                            type="button"
                            onClick={() => toggleCollapse(b.groupId!)}
                            aria-label={isCollapsed ? "Expand group" : "Collapse group"}
                            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                          >
                            {isCollapsed ? "▸" : "▾"}
                          </button>
                          <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">⊞ Group screen</span>
                          <GroupTitleInput value={group?.title ?? ""} onCommit={(t) => renameGroup(b.groupId!, t)} />
                          {isCollapsed ? (
                            <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">· {memberCount} questions</span>
                          ) : null}
                        </div>
                      ) : null}
                      <div className={cn("flex items-stretch gap-1", grouped && "border-l-2 border-[var(--color-primary)] pl-2")}>
                        <span
                          ref={handle.ref}
                          {...handle.attributes}
                          {...handle.listeners}
                          aria-label="Drag to reorder"
                          className="flex shrink-0 cursor-grab touch-none items-center rounded-[var(--radius-md)] px-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] active:cursor-grabbing"
                        >
                          <GripVertical className="size-4" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <BlockCard
                            block={b}
                            selected={b.instanceId === selectedId}
                            onSelect={() => setSelectedId(b.instanceId)}
                            conditionLabel={summarizeCondition(
                              conditionWithSources(
                                b.showIf,
                                b.branchRules,
                                new Set(study.blocks.slice(0, i).map((x) => x.instanceId)),
                              ),
                              nameOf,
                            )}
                          />
                        </div>
                        <div className="flex shrink-0 items-center">
                          {grouped ? (
                            <button
                              type="button"
                              onClick={() => ungroup(b.instanceId)}
                              title="Remove from group"
                              className="rounded-[var(--radius-sm)] px-1.5 py-1 text-[length:var(--text-small)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)]"
                            >
                              Ungroup
                            </button>
                          ) : i > 0 ? (
                            <button
                              type="button"
                              onClick={() => groupWithAbove(i)}
                              title="Show on the same screen as the block above"
                              className="rounded-[var(--radius-sm)] px-1.5 py-1 text-[length:var(--text-small)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)]"
                            >
                              Group ↑
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                }}
              </SortableList>
            )}

            <div className="relative self-start">
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
              >
                <Plus className="size-4" aria-hidden />
                Add block
              </button>
              {pickerOpen ? (
                <ModulePicker
                  pending={addBlock.isPending}
                  onClose={() => setPickerOpen(false)}
                  onInsert={(m) => addBlock.mutate({ studyId: study.id, ...m })}
                />
              ) : null}
            </div>
          </section>
        </div>
      </main>

      {/* Right context panel */}
      <aside className="flex w-[250px] shrink-0 flex-col gap-4 self-start rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] p-4">
        <nav role="tablist" aria-label="Context" className="flex flex-wrap gap-1">
          {selected ? (
            <>
              {/* Clickable: returns to the study Details by deselecting the block. */}
              <button
                type="button"
                role="tab"
                onClick={() => {
                  setSelectedId(null);
                  setPanelTab("details");
                }}
                className="rounded-[var(--radius-sm)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
              >
                Details
              </button>
              <span role="tab" aria-current="page" className={tabActiveCls}>
                Configure
              </span>
              {["History", "Replications", "Comments", "Validation"].map((t) => (
                <TabSoon key={t} label={t} />
              ))}
            </>
          ) : (
            <>
              <button
                type="button"
                role="tab"
                aria-current={panelTab === "details" ? "page" : undefined}
                onClick={() => setPanelTab("details")}
                className={panelTab === "details" ? tabActiveCls : tabIdleCls}
              >
                Details
              </button>
              <button
                type="button"
                role="tab"
                aria-current={panelTab === "versions" ? "page" : undefined}
                onClick={() => setPanelTab("versions")}
                className={panelTab === "versions" ? tabActiveCls : tabIdleCls}
              >
                Versions
              </button>
              <button
                type="button"
                role="tab"
                aria-current={panelTab === "replications" ? "page" : undefined}
                onClick={() => setPanelTab("replications")}
                className={panelTab === "replications" ? tabActiveCls : tabIdleCls}
              >
                Replications
              </button>
              <TabSoon label="Comments" />
              <TabSoon label="Validation" />
            </>
          )}
        </nav>

        {selected ? (
          <>
            <ConfigureForm
              key={`${selected.instanceId}-${panelEpoch}`}
              block={selected}
              pending={updateConfig.isPending || removeBlock.isPending}
              onChange={(config) =>
                updateConfig.mutate({ studyId: study.id, instanceId: selected.instanceId, config })
              }
              onRename={(title) =>
                renameBlock.mutate({ studyId: study.id, instanceId: selected.instanceId, title })
              }
              onRemove={() => {
                removeBlock.mutate({ studyId: study.id, instanceId: selected.instanceId });
                setSelectedId(null);
              }}
            />
            <BlockVisibilityField
              key={`vis-${selected.instanceId}-${panelEpoch}`}
              studyId={study.id}
              instanceId={selected.instanceId}
              current={selected.showIfCondition}
            />
            <ConditionBuilder
              key={`cond-${selected.instanceId}-${panelEpoch}`}
              block={selected}
              earlierBlocks={study.blocks.slice(0, study.blocks.findIndex((b) => b.instanceId === selected.instanceId))}
              pending={setCondition.isPending}
              onSave={(showIf) =>
                setCondition.mutate({ studyId: study.id, instanceId: selected.instanceId, showIf })
              }
            />
          </>
        ) : panelTab === "versions" ? (
          <VersionsPanel
            studyId={study.id}
            onRestored={(message) => {
              void invalidate();
              setSavedMsg(message);
            }}
          />
        ) : panelTab === "replications" ? (
          <ReplicationsPanel studyId={study.id} />
        ) : (
          <div className="flex flex-col gap-3">
            <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">
              At a glance
            </h2>
            <DetailRow label="Status">
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-subtle)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                {STAGE_LABEL[study.stage]}
              </span>
            </DetailRow>
            <DetailRow label="Owner">
              <span className="flex items-center gap-2">
                <span className="text-[length:var(--text-body)] text-[var(--color-text-primary)]">
                  {study.ownerName || "—"}
                </span>
                {/* Follow the author — hidden for your own studies (follow-affordances.md). */}
                {currentUserId && currentUserId !== study.ownerId ? (
                  <FollowButton targetType="author" targetId={study.ownerId} name={study.ownerName} />
                ) : null}
              </span>
            </DetailRow>
            <DetailRow label="Blocks">
              <span className="text-[length:var(--text-body)] text-[var(--color-text-primary)]">
                {study.blocks.length}
              </span>
            </DetailRow>

            {/* Follow this study (track a study you don't own). */}
            {currentUserId && currentUserId !== study.ownerId ? (
              <FollowButton
                targetType="study"
                targetId={study.id}
                name={study.title}
                className="self-start"
              />
            ) : null}

            <TagsSection studyId={study.id} tags={study.tags} />

            {/* Replication (ADR-0018, replications-tab.md): forkability is owner-only; anyone who can open the study can replicate it. */}
            <DetailRow label="Replication">
              <div className="flex flex-col gap-2">
                {currentUserId === study.ownerId ? (
                  <ForkableControl studyId={study.id} value={study.forkableBy} />
                ) : null}
                <ReplicateButton studyId={study.id} />
              </div>
            </DetailRow>

            <ConditionsSection studyId={study.id} />
          </div>
        )}
      </aside>

      {saveOpen ? (
        <SaveVersionDialog
          studyId={study.id}
          incompleteCount={study.blocks.filter((b) => !b.complete).length}
          onClose={() => setSaveOpen(false)}
          onSaved={(name, n) => {
            setSaveOpen(false);
            setSavedMsg(`Saved “${name}” as v${n}`);
            void invalidate();
          }}
        />
      ) : null}

      {savedMsg ? (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-[var(--radius-md)] bg-[var(--color-success-subtle)] px-4 py-2 text-[length:var(--text-small)] font-medium text-[var(--color-success-text-on-subtle)]"
          style={{ boxShadow: "var(--shadow-md)" }}
        >
          {savedMsg}
        </div>
      ) : null}

      <ConfirmDialog
        open={pendingReorder !== null}
        title="Reordering will remove some conditions"
        body="These conditions point at blocks that would no longer come earlier in the flow, so they’ll be removed:"
        items={pendingReorder?.items ?? []}
        confirmLabel="Reorder and remove"
        tone="danger"
        onConfirm={() => {
          if (pendingReorder)
            setGroupsMut.mutate({ studyId: study.id, blocks: pendingReorder.blocks, groups: pendingReorder.groups });
          setPendingReorder(null);
        }}
        onCancel={() => setPendingReorder(null)}
      />
    </>
  );
}

function BlockCard({
  block,
  selected,
  onSelect,
  conditionLabel,
}: {
  block: StudyBlock;
  selected: boolean;
  onSelect: () => void;
  conditionLabel?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-start justify-between gap-3 rounded-[var(--radius-md)] border p-3 text-left",
        selected
          ? "border-[var(--color-border-medium)] bg-[var(--color-surface-subtle)]"
          : "border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)]",
      )}
    >
      <div className="min-w-0">
        <div className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
          {block.title?.trim() || block.name}
        </div>
        <div className="font-mono text-[length:var(--text-mono)] text-[var(--color-text-muted)]">
          {block.key} · {block.version}
        </div>
        {conditionLabel ? (
          <div className="mt-1 inline-block rounded-full bg-[var(--color-primary-subtle)] px-1.5 py-0.5 text-[length:var(--text-small)] text-[var(--color-primary-text-on-subtle)]">
            Shown if {conditionLabel}
          </div>
        ) : null}
      </div>
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--text-small)] font-medium",
        )}
        style={
          block.complete
            ? {
                backgroundColor: "var(--color-success-subtle)",
                color: "var(--color-success-text-on-subtle)",
              }
            : {
                backgroundColor: "var(--color-danger-subtle)",
                color: "var(--color-danger-text-on-subtle)",
              }
        }
      >
        <span
          className="size-1.5 rounded-full"
          style={{
            backgroundColor: block.complete
              ? "var(--color-success)"
              : "var(--color-danger)",
          }}
        />
        {block.complete ? "Ready" : "Needs setup"}
      </span>
    </button>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </span>
      {children}
    </div>
  );
}

/** Group-title field that commits only on blur / Enter (not per keystroke), so
 *  renaming a group doesn't fire an autosave on every letter (Section L). */
function GroupTitleInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => {
    if (v !== value) onCommit(v);
  };
  return (
    <input
      value={v}
      placeholder="Group title"
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
    />
  );
}
