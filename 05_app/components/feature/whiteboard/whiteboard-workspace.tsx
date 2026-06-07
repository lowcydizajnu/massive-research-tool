"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";

import { StageTabs } from "@/components/chrome/stage-tabs";
import { BlockVisibilityField } from "@/components/feature/builder/block-visibility-field";
import { ConfigureForm } from "@/components/feature/builder/configure-form";
import { ModeToggle } from "@/components/feature/builder/mode-toggle";
import { ModulePicker } from "@/components/feature/builder/module-picker";
import { api } from "@/lib/trpc/react";
import type { StudyDetail } from "@/server/trpc/routers/studies";

import { WhiteboardCanvas } from "./whiteboard-canvas";
import { WhiteboardList } from "./whiteboard-list";
import { cn } from "@/lib/utils";

/**
 * Whiteboard mode workspace (ADR-0020). The graph view of a study with the same
 * round-trip edits as Builder — add (ModulePicker), remove + configure
 * (ConfigureForm), and visibility wiring (BlockVisibilityField) — all flowing
 * through the existing Builder tRPC mutations (no new edit endpoints, A5).
 * Selecting a node opens the shared Configure panel; the canvas re-derives from
 * the same `definition_snapshot.blocks` after each mutation.
 */
export function WhiteboardWorkspace({ study: initial }: { study: StudyDetail }) {
  const utils = api.useUtils();
  const { data } = api.studies.get.useQuery({ id: initial.id }, { initialData: initial });
  const study = data ?? initial;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [view, setView] = useState<"canvas" | "list">("canvas");

  const invalidate = () => utils.studies.get.invalidate({ id: study.id });
  const addBlock = api.studies.addBlock.useMutation({
    onSuccess: ({ instanceId }) => {
      setSelectedId(instanceId);
      setPickerOpen(false);
      void invalidate();
    },
  });
  const removeBlock = api.studies.removeBlock.useMutation({ onSuccess: () => void invalidate() });
  const updateConfig = api.studies.updateBlockConfig.useMutation({ onSuccess: () => void invalidate() });

  // Conditions drive the canvas wires (drag a Condition node → a block to gate it).
  const conditions = api.studies.listConditions.useQuery({ studyId: study.id });
  const setVisibility = api.studies.setBlockVisibility.useMutation({ onSuccess: () => void invalidate() });
  const setBlockConditions = (instanceId: string, showIfCondition: string[]) =>
    setVisibility.mutate({ studyId: study.id, instanceId, showIfCondition });
  const connectCondition = (blockId: string, slug: string) => {
    const b = study.blocks.find((x) => x.instanceId === blockId);
    if (!b || b.showIfCondition.includes(slug)) return;
    setBlockConditions(blockId, [...b.showIfCondition, slug]);
  };
  const disconnectCondition = (blockId: string, slug: string) => {
    const b = study.blocks.find((x) => x.instanceId === blockId);
    if (!b) return;
    setBlockConditions(blockId, b.showIfCondition.filter((s) => s !== slug));
  };

  const selected = study.blocks.find((b) => b.instanceId === selectedId) ?? null;

  // Keep selection valid if a block disappears (e.g. removed).
  useEffect(() => {
    if (selectedId && !study.blocks.some((b) => b.instanceId === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, study.blocks]);

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-3">
      <StageTabs studyId={study.id} active="Build" />
      <div className="flex flex-1 gap-3">
        <section className="flex min-w-0 flex-1 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-ink-deep)]">
                {study.title}
              </h1>
              <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                Whiteboard — blocks as a graph, visibility rules as wires. Click a block to configure it.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div role="group" aria-label="Whiteboard view" className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-0.5 text-[length:var(--text-small)]">
                {(["canvas", "list"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    onClick={() => setView(v)}
                    className={cn(
                      "rounded-[var(--radius-sm)] px-2 py-1 font-medium capitalize",
                      view === v
                        ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
                        : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPickerOpen((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
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
              <Link
                href={`/studies/${study.id}/build/whiteboard/compare` as Route}
                className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
              >
                Compare versions
              </Link>
              <ModeToggle studyId={study.id} mode="whiteboard" />
            </div>
          </div>

          {view === "canvas" ? (
            <>
              <WhiteboardCanvas
                study={study}
                conditions={(conditions.data ?? []).map((c) => ({ slug: c.slug, name: c.name }))}
                selectedId={selectedId}
                onSelectBlock={setSelectedId}
                onConnectCondition={connectCondition}
                onDisconnectCondition={disconnectCondition}
              />
              <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                {(conditions.data ?? []).length === 0
                  ? "Tip: add conditions in Builder’s Conditions section to wire visibility rules here."
                  : "Drag a wire from a Condition node to a block to show it only for that condition; select a wire and press Delete to remove it."}
              </p>
            </>
          ) : (
            <WhiteboardList
              blocks={study.blocks}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </section>

        {/* Right context panel — Configure the selected block (shared with Builder). */}
        <aside className="flex w-[250px] shrink-0 flex-col gap-4 self-start rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] p-4">
          {selected ? (
            <>
              <ConfigureForm
                key={selected.instanceId}
                block={selected}
                pending={updateConfig.isPending || removeBlock.isPending}
                onChange={(config) =>
                  updateConfig.mutate({ studyId: study.id, instanceId: selected.instanceId, config })
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
            </>
          ) : (
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              Select a block on the canvas to configure it, or “Add block” to drop a new one.
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}
