"use client";

import { GripVertical, Plus, Redo2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";

import { SortableList } from "@/components/feature/whiteboard/sortable-list";
import { useBlockHistory } from "@/lib/whiteboard/use-block-history";
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
  const reorderBlocks = api.studies.reorderBlocks.useMutation({ onSuccess: () => void invalidate() });
  const setCondition = api.studies.setBlockCondition.useMutation({ onSuccess: () => void invalidate() });
  const setBlocksMut = api.studies.setBlocks.useMutation({ onSuccess: () => void invalidate() });
  const { canUndo, canRedo, undo, redo } = useBlockHistory(study.id, study.blocks, (blocks) =>
    setBlocksMut.mutate({ studyId: study.id, blocks }),
  );
  const [pendingReorder, setPendingReorder] = useState<{ order: string[]; items: string[] } | null>(null);
  const nameOf = (id: string) => {
    const b = study.blocks.find((x) => x.instanceId === id);
    return b ? b.title?.trim() || b.name : id;
  };
  const requestReorder = (order: string[]) => {
    const byId = new Map(study.blocks.map((b) => [b.instanceId, b]));
    const ordered = order.map((id) => byId.get(id)).filter(Boolean) as typeof study.blocks;
    const broken = newlyBrokenByReorder(study.blocks, ordered);
    if (broken.length === 0) {
      reorderBlocks.mutate({ studyId: study.id, order });
      return;
    }
    setPendingReorder({
      order,
      items: broken.map((b) => `"${nameOf(b.targetId)}": ${summarizeClause(b.clause, nameOf)}`),
    });
  };

  const selected = study.blocks.find((b) => b.instanceId === selectedId) ?? null;

  useEffect(() => {
    if (!savedMsg) return;
    const t = setTimeout(() => setSavedMsg(null), 3000);
    return () => clearTimeout(t);
  }, [savedMsg]);

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
                  return (
                    <div className="flex items-stretch gap-1">
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
              key={selected.instanceId}
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
              studyId={study.id}
              instanceId={selected.instanceId}
              current={selected.showIfCondition}
            />
            <ConditionBuilder
              key={`cond-${selected.instanceId}`}
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
          if (pendingReorder) reorderBlocks.mutate({ studyId: study.id, order: pendingReorder.order });
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
