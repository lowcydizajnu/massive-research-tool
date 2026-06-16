"use client";

import { GripVertical, Plus, Redo2, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";

import { SortableList } from "@/components/feature/whiteboard/sortable-list";
import { useBlockHistory } from "@/lib/whiteboard/use-block-history";
import { regroupAfterMove } from "@/lib/whiteboard/screens";
import { groupToDefinition } from "@/lib/custom-modules";
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
import { BlockLibraryModal } from "./block-library-modal";
import { ForkableControl, ReplicateButton, ReplicationsPanel } from "./replications-panel";
import { SaveVersionDialog } from "./save-version-dialog";
import { TagsSection } from "./tags-section";
import { ValidationPanel } from "./validation-panel";
import { VersionsPanel } from "./versions-panel";
import {
  PANEL_SIDE_EVENT,
  readPanelSide,
  type PanelSide,
} from "@/components/feature/settings/panel-side-toggle";
import { PaneHandle, usePaneWidth } from "@/components/chrome/pane-resize";
import { BlockHistoryPanel } from "./block-history-panel";
import { ReplicationBanner } from "./replication-banner";
import { ReplicationConfigExtras } from "./replication-config-extras";
import { BlockProvenance } from "./block-provenance";
import { ConsentEditor } from "./consent-editor";
import { BuildDriftBanner } from "./build-drift-banner";
import { canWriteRole, READ_ONLY_TITLE, ReadOnlyBanner } from "@/components/feature/workspace/role-gate";

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
  // Viewers are read-only (mirrors writeProcedure). Gates every write affordance
  // here; the editor sub-components are wrapped in a disabled <fieldset>, and the
  // drag/library handlers below early-return as a belt-and-braces net.
  const canEdit = canWriteRole(study.viewerRole);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<"details" | "replications" | "versions" | "validation">("details");
  // Tab WITHIN a selected block: Configure ↔ History (this block's own story).
  const [blockTab, setBlockTab] = useState<"configure" | "history">("configure");
  useEffect(() => setBlockTab("configure"), [selectedId]);
  // Right-panel side preference (IA v0.4 M4) — per device; live-updates from Settings.
  const [panelSide, setPanelSide] = useState<PanelSide>("right");
  useEffect(() => {
    setPanelSide(readPanelSide());
    const onChange = (e: Event) => setPanelSide((e as CustomEvent<PanelSide>).detail);
    window.addEventListener(PANEL_SIDE_EVENT, onChange);
    return () => window.removeEventListener(PANEL_SIDE_EVENT, onChange);
  }, []);
  // Work-surface ↔ context-panel divider is draggable too (owner request, M2 follow-up).
  const panelPane = usePaneWidth("mrt-builder-panel-width", 250, 220, 480);
  const [pickerOpen, setPickerOpen] = useState(false);
  // The pinned Consent card is selected (its editor replaces the context panel).
  // Selecting any block wins over it (the aside renders the editor only while
  // no block is selected).
  const [consentSelected, setConsentSelected] = useState(false);
  // A library card is mid-drag (the modal hides itself; list rows become drop targets).
  const [libraryDragging, setLibraryDragging] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const invalidate = () => {
    void utils.studies.get.invalidate({ id: study.id });
    // Replication badges/banner + readiness derive from the tip — keep them live.
    void utils.studies.replicationStatus.invalidate({ studyId: study.id });
    void utils.studies.preflight.invalidate();
  };
  const addBlock = api.studies.addBlock.useMutation({
    onSuccess: ({ instanceId }) => {
      setSelectedId(instanceId);
      setPickerOpen(false);
      void invalidate();
    },
  });
  // Optimistic: the row disappears on click; a failure rolls it back (owner
  // feedback 2026-06-12 — actions felt seconds-delayed because the Builder
  // renders straight from the studies.get cache and waited for the refetch).
  const removeBlock = api.studies.removeBlock.useMutation({
    onMutate: async ({ instanceId }) => {
      await utils.studies.get.cancel({ id: study.id });
      const prev = utils.studies.get.getData({ id: study.id });
      if (prev) {
        utils.studies.get.setData(
          { id: study.id },
          { ...prev, blocks: prev.blocks.filter((b) => b.instanceId !== instanceId) },
        );
      }
      return { prev };
    },
    onError: (_err, _input, mctx) => {
      if (mctx?.prev) utils.studies.get.setData({ id: study.id }, mctx.prev);
    },
    onSuccess: () => void invalidate(),
  });
  const updateConfig = api.studies.updateBlockConfig.useMutation({
    onSuccess: () => void invalidate(),
  });
  const renameBlock = api.studies.setBlockTitle.useMutation({ onSuccess: () => void invalidate() });
  const setCondition = api.studies.setBlockCondition.useMutation({
    // Optimistic — the visibility editor reads from the cache, so reflect the
    // chosen clause immediately.
    onMutate: async ({ instanceId, showIf }) => {
      await utils.studies.get.cancel({ id: study.id });
      const prev = utils.studies.get.getData({ id: study.id });
      if (prev) {
        utils.studies.get.setData(
          { id: study.id },
          {
            ...prev,
            blocks: prev.blocks.map((b) =>
              b.instanceId === instanceId ? { ...b, showIf: showIf ?? null } : b,
            ),
          },
        );
      }
      return { prev };
    },
    onError: (_err, _input, mctx) => {
      if (mctx?.prev) utils.studies.get.setData({ id: study.id }, mctx.prev);
    },
    onSuccess: () => void invalidate(),
  });
  // Bump on a restore (undo/redo) so the right-panel editors re-seed (they hold
  // local state keyed by block id, which a restore doesn't change). Normal edits
  // don't bump it, so typing isn't interrupted.
  const [panelEpoch, setPanelEpoch] = useState(0);
  const setGroupsMut = api.studies.setGroups.useMutation({
    // Optimistic — a dropped block must STAY where it was dropped (owner: "it
    // comes back to the initial position and then moves"). Patch the cache with
    // the new order/grouping before the round-trip; roll back on error.
    onMutate: async (input) => {
      await utils.studies.get.cancel({ id: study.id });
      const prev = utils.studies.get.getData({ id: study.id });
      if (prev) {
        const byId = new Map(prev.blocks.map((b) => [b.instanceId, b]));
        const blocks = prev.blocks.length
          ? input.blocks.flatMap((ib) => {
              const full = byId.get(ib.instanceId);
              return full ? [{ ...full, groupId: ib.groupId ?? null }] : [];
            })
          : prev.blocks;
        utils.studies.get.setData({ id: study.id }, { ...prev, blocks, groups: input.groups });
      }
      return { prev };
    },
    onError: (_err, _input, mctx) => {
      if (mctx?.prev) utils.studies.get.setData({ id: study.id }, mctx.prev);
    },
    onSuccess: () => {
      void invalidate();
      setPanelEpoch((e) => e + 1);
    },
  });
  const { canUndo, canRedo, undo, redo } = useBlockHistory(study.id, study.blocks, study.groups, (snap) =>
    setGroupsMut.mutate({ studyId: study.id, blocks: snap.blocks, groups: snap.groups }),
  );

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
    ...(b.divergenceNote ? { divergenceNote: b.divergenceNote } : {}),
    ...(groupId ? { groupId } : {}),
  });
  /** Persist a groupId override for one block + recompute the groups[] metadata. */
  const persistGroupChange = (changedId: string, newGroupId: string | null, newGroup?: { id: string; title: string }) => {
    if (!canEdit) return;
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
    if (!canEdit) return;
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
  // Remove a whole group (the inserted module) from the study — deletes all its
  // member blocks at once. Does NOT touch the saved module template.
  const [confirmRemoveGroup, setConfirmRemoveGroup] = useState<string | null>(null);
  const removeGroup = (groupId: string) => {
    if (!canEdit) return;
    const blocks = study.blocks.filter((b) => b.groupId !== groupId).map((b) => toInstance(b, b.groupId));
    const usedIds = new Set(blocks.map((b) => b.groupId).filter(Boolean) as string[]);
    const groups = study.groups.filter((g) => g.id !== groupId && usedIds.has(g.id));
    setGroupsMut.mutate({ studyId: study.id, blocks, groups });
    if (selectedId && !blocks.some((b) => b.instanceId === selectedId)) setSelectedId(null);
  };
  // Top-level segments: each is a lone block or a whole group (one draggable
  // unit). A group's handle drags the whole group; member grips reorder within.
  type Segment =
    | { kind: "block"; key: string; block: StudyBlock }
    | { kind: "group"; key: string; id: string; group?: StudyDetail["groups"][number]; members: StudyBlock[] };
  const buildSegments = (): Segment[] => {
    const segs: Segment[] = [];
    const seen = new Set<string>();
    for (const b of study.blocks) {
      if (b.groupId) {
        if (seen.has(b.groupId)) continue;
        seen.add(b.groupId);
        segs.push({
          kind: "group",
          key: `g:${b.groupId}`,
          id: b.groupId,
          group: study.groups.find((g) => g.id === b.groupId),
          members: study.blocks.filter((x) => x.groupId === b.groupId),
        });
      } else {
        segs.push({ kind: "block", key: b.instanceId, block: b });
      }
    }
    return segs;
  };
  // The flat drag list: a header row per group (its grip drags the whole group)
  // followed by the group's member rows; lone blocks are their own rows. One
  // SortableContext → members can be dragged OUT to the top level (regrouped on
  // drop), reordered, or pulled into a group (ADR-0028).
  const GH = "gh:";
  // Members stay in the list even when collapsed (rendered as thin one-liners),
  // so they remain draggable + the group bg stays contiguous.
  const listIds = (): string[] =>
    buildSegments().flatMap((s) =>
      s.kind === "group" ? [`${GH}${s.id}`, ...s.members.map((m) => m.instanceId)] : [s.block.instanceId],
    );
  // Commit a final block order (each block carries its final groupId) with the
  // broken-condition guard.
  const commitOrder = (ordered: StudyBlock[]) => {
    if (!canEdit) return;
    const broken = newlyBrokenByReorder(study.blocks, ordered);
    const blocks = ordered.map((b) => toInstance(b, b.groupId));
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
  const onListReorder = (newIds: string[], movedId: string) => {
    const byId = new Map(study.blocks.map((b) => [b.instanceId, b]));
    const blockIds = newIds.filter((id) => !id.startsWith(GH));
    if (movedId.startsWith(GH)) {
      // A group header moved → relocate the whole group's run to the header's spot.
      const gid = movedId.slice(GH.length);
      const memberIds = study.blocks.filter((b) => b.groupId === gid).map((b) => b.instanceId);
      const rest = blockIds.filter((id) => !memberIds.includes(id));
      const hIdx = newIds.indexOf(movedId);
      let anchor: string | null = null;
      for (let k = hIdx - 1; k >= 0; k--) {
        if (!newIds[k].startsWith(GH)) {
          anchor = newIds[k];
          break;
        }
      }
      const at = anchor ? rest.indexOf(anchor) + 1 : 0;
      const merged = [...rest.slice(0, at), ...memberIds, ...rest.slice(at)];
      commitOrder(merged.map((id) => byId.get(id)!)); // groupIds unchanged
    } else {
      // A block moved → recompute its group from drop neighbors (join/leave/reorder).
      const minimal = blockIds.map((id) => ({ instanceId: id, groupId: byId.get(id)?.groupId ?? null }));
      const regrouped = regroupAfterMove(minimal, movedId);
      commitOrder(regrouped.map((r) => ({ ...byId.get(r.instanceId)!, groupId: r.groupId })));
    }
  };
  // Library drag-to-position (block-library-modal.md): dropping a card on a row
  // inserts AFTER that row's block — or after the whole group for member rows,
  // and BEFORE the group when dropped on its header — so group runs stay contiguous.
  const insertIndexFor = (rowId: string): number => {
    if (rowId.startsWith(GH)) {
      const gid = rowId.slice(GH.length);
      const first = study.blocks.findIndex((b) => b.groupId === gid);
      return first === -1 ? study.blocks.length : first;
    }
    const b = study.blocks.find((x) => x.instanceId === rowId);
    if (!b) return study.blocks.length;
    if (b.groupId) {
      let last = -1;
      study.blocks.forEach((x, i) => {
        if (x.groupId === b.groupId) last = i;
      });
      return last + 1;
    }
    return study.blocks.findIndex((x) => x.instanceId === rowId) + 1;
  };
  const handleLibraryDrop = (rowId: string, e: React.DragEvent) => {
    if (!canEdit) return;
    const raw = e.dataTransfer.getData("application/x-mrt-block");
    setLibraryDragging(false);
    if (!raw) return;
    try {
      const m = JSON.parse(raw) as { source: string; key: string; version: string };
      addBlock.mutate({ studyId: study.id, ...m, atIndex: insertIndexFor(rowId) });
      setPickerOpen(false); // the drop finished the add — don't leave a hidden modal up
    } catch {
      // not our payload — ignore
    }
  };
  /** Bulk add from the library's checkbox selection — sequential, order preserved. */
  const handleBulkInsert = async (sel: {
    blocks: { source: string; key: string; version: string }[];
    customModuleIds: string[];
  }) => {
    if (!canEdit) return;
    for (const m of sel.blocks) {
      await addBlock.mutateAsync({ studyId: study.id, ...m });
    }
    for (const id of sel.customModuleIds) {
      await insertModuleMut.mutateAsync({ studyId: study.id, customModuleId: id });
    }
    void invalidate();
  };

  // Gate a whole group by an arm: set/clear the arm on every member (runtime
  // filters by arm at the block level). Mirrors the Whiteboard's group wire.
  const conditionsQ = api.studies.listConditions.useQuery({ studyId: study.id });
  // Replication mode (ADR-0039): null for ordinary studies.
  const replicationQ = api.studies.replicationStatus.useQuery({ studyId: study.id });
  const divergenceBadges = replicationQ.data?.badges ?? {};

  // Custom composite modules (ADR-0029): save a group as a reusable template,
  // insert one as a new group, delete one.
  const customModulesQ = api.studies.listCustomModules.useQuery();
  const [savingGroupId, setSavingGroupId] = useState<string | null>(null);
  const [moduleName, setModuleName] = useState("");
  const saveModuleMut = api.studies.saveGroupAsModule.useMutation({
    onSuccess: (data) => {
      const gid = savingGroupId;
      setSavingGroupId(null);
      setModuleName("");
      setSavedMsg("Saved as a reusable module.");
      void customModulesQ.refetch();
      // Link the group to the new module so later edits offer "Update" vs "Save as new".
      if (gid) {
        const blocks = study.blocks.map((b) => toInstance(b, b.groupId));
        const usedIds = new Set(blocks.map((b) => b.groupId).filter(Boolean) as string[]);
        const groups = study.groups
          .filter((g) => usedIds.has(g.id))
          .map((g) => (g.id === gid ? { ...g, moduleId: data.id } : g));
        setGroupsMut.mutate({ studyId: study.id, blocks, groups });
      }
    },
  });
  const insertModuleMut = api.studies.insertCustomModule.useMutation({
    onSuccess: () => {
      setPickerOpen(false);
      void invalidate();
    },
  });
  const removeModuleMut = api.studies.removeCustomModule.useMutation({ onSuccess: () => void customModulesQ.refetch() });
  const setPublicMut = api.studies.setModulePublic.useMutation({ onSuccess: () => void customModulesQ.refetch() });
  const saveBlockMut = api.studies.saveBlockAsModule.useMutation({
    onSuccess: () => {
      setSavedMsg("Saved as a reusable block.");
      void customModulesQ.refetch();
    },
  });
  const [confirmUpdate, setConfirmUpdate] = useState<{ moduleId: string; groupId: string; name: string } | null>(null);
  const updateModuleMut = api.studies.updateCustomModule.useMutation({
    onSuccess: (data) => {
      setConfirmUpdate(null);
      setSavedMsg(
        data.propagated > 0
          ? `Module updated · ${data.propagated} other use${data.propagated === 1 ? "" : "s"} synced.`
          : "Module updated.",
      );
      void customModulesQ.refetch();
      void invalidate();
    },
  });
  // A group differs from its source module → only then offer "Update".
  const groupDiffersFromModule = (gid: string, title: string | undefined, def: unknown): boolean => {
    const members = study.blocks.filter((b) => b.groupId === gid) as unknown as Parameters<typeof groupToDefinition>[0];
    return JSON.stringify(groupToDefinition(members, title)) !== JSON.stringify(def);
  };
  const armsForGroup = (groupId: string): string[] => {
    const members = study.blocks.filter((b) => b.groupId === groupId);
    if (!members.length) return [];
    return members[0].showIfCondition.filter((s) => members.every((m) => m.showIfCondition.includes(s)));
  };
  const setGroupArm = (groupId: string, slug: string, on: boolean) => {
    if (!canEdit) return;
    const blocks = study.blocks.map((b) => {
      const arms =
        b.groupId !== groupId
          ? b.showIfCondition
          : on
            ? b.showIfCondition.includes(slug)
              ? b.showIfCondition
              : [...b.showIfCondition, slug]
            : b.showIfCondition.filter((s) => s !== slug);
      return {
        instanceId: b.instanceId,
        source: b.source,
        key: b.key,
        version: b.version,
        config: b.config,
        ...(b.title ? { title: b.title } : {}),
        ...(arms.length ? { visibility: { showIfCondition: arms } } : {}),
        ...(b.branchRules.length ? { branchRules: b.branchRules } : {}),
        ...(b.showIf ? { showIf: b.showIf } : {}),
        ...(b.groupId ? { groupId: b.groupId } : {}),
      };
    });
    const usedIds = new Set(blocks.map((b) => b.groupId).filter(Boolean) as string[]);
    setGroupsMut.mutate({ studyId: study.id, blocks, groups: study.groups.filter((g) => usedIds.has(g.id)) });
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
        if (canEdit) setSaveOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit]);

  return (
    <>
      {panelSide === "left" ? (
        <PaneHandle pane={panelPane} dir={1} label="Resize study panel" />
      ) : null}
      <main className="flex min-w-0 flex-1 flex-col gap-3">
        <StageTabs studyId={study.id} />
        <BuildDriftBanner studyId={study.id} />
        <ReadOnlyBanner role={study.viewerRole} />

        <div className="flex flex-1 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
          {/* Title row */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <fieldset disabled={!canEdit} className="contents">
                <EditableStudyTitle studyId={study.id} initialTitle={study.title} />
              </fieldset>
              <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                {/* Autosave tip is the unnumbered Draft (ADR-0012 amendment); v1+ are conscious
                    saves. Version label and stage can coincide ("Draft · draft") — show once. */}
                {study.versionNumber > 0 ? `v${study.versionNumber}` : "Draft"}
                {STAGE_LABEL[study.stage].toLowerCase() !==
                (study.versionNumber > 0 ? `v${study.versionNumber}` : "draft")
                  ? ` · ${STAGE_LABEL[study.stage]}`
                  : ""}{" "}
                · Edited {formatEdited(study.lastEditedAt)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={undo}
                disabled={!canEdit || !canUndo || setGroupsMut.isPending}
                title={canEdit ? "Undo last change" : READ_ONLY_TITLE}
                aria-label="Undo last change"
                className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-40"
              >
                <Undo2 className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={!canEdit || !canRedo || setGroupsMut.isPending}
                title={canEdit ? "Redo" : READ_ONLY_TITLE}
                aria-label="Redo last undone change"
                className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-40"
              >
                <Redo2 className="size-4" aria-hidden />
              </button>
              <Link
                href={`/studies/${study.id}/build/whiteboard/compare` as Route}
                className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
              >
                Compare versions
              </Link>
              <ModeToggle studyId={study.id} mode="builder" />
              <button
                type="button"
                onClick={() => setSaveOpen(true)}
                disabled={!canEdit}
                title={canEdit ? undefined : READ_ONLY_TITLE}
                className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-[length:var(--text-body-emphasis)] font-medium text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>

          {/* Blocks */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-1">
              <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">Blocks</h2>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                disabled={!canEdit}
                title={canEdit ? undefined : READ_ONLY_TITLE}
                className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2.5 py-1 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-40"
              >
                <Plus className="size-3.5" aria-hidden />
                Add block
              </button>
            </div>

            <ReplicationBanner studyId={study.id} />

            {/* Consent screen — pinned, never draggable (ADR-0035): always the
                participant's first screen, so it lives above the sortable list. */}
            <button
              type="button"
              aria-label="Consent screen settings"
              onClick={() => {
                setSelectedId(null);
                setConsentSelected(true);
              }}
              className={`flex items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-left ${
                consentSelected
                  ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)]/40"
                  : "border-dashed border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)]"
              }`}
            >
              <span aria-hidden className="text-[15px]">🛡</span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[length:var(--text-body)] font-medium text-[var(--color-text-primary)]">
                  Consent screen
                </span>
                <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                  Always shown first · Agree starts the study · pinned
                </span>
              </span>
            </button>

            {study.blocks.length === 0 ? (
              <div
                onDragOver={libraryDragging ? (e) => e.preventDefault() : undefined}
                onDrop={libraryDragging ? (e) => handleLibraryDrop("", e) : undefined}
                className="flex flex-col items-center gap-3 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-10 text-center"
              >
                <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
                  No blocks yet — your study starts here.
                </p>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  disabled={!canEdit}
                  title={canEdit ? undefined : READ_ONLY_TITLE}
                  className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-[length:var(--text-body-emphasis)] font-medium text-white hover:opacity-90 disabled:opacity-40"
                >
                  Browse the block library
                </button>
              </div>
            ) : (
              <SortableList
                ids={listIds()}
                onReorder={onListReorder}
                ariaLabel="Study blocks and groups"
                className="flex flex-col"
                disabled={!canEdit}
                nativeDrop={{ active: libraryDragging && canEdit, onDrop: handleLibraryDrop }}
              >
                {(id, handle) => {
                  // Group header row — its grip drags the whole group. Solid tint +
                  // rounded top; members below share the tint with no gap (one block).
                  if (id.startsWith(GH)) {
                    const gid = id.slice(GH.length);
                    const group = study.groups.find((g) => g.id === gid);
                    const collapsed = collapsedGroups.has(gid);
                    return (
                      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-t-[var(--radius-md)] border-l-2 border-[var(--color-primary)] bg-[var(--color-primary-subtle)]/40 px-2 py-1.5">
                        <span
                          ref={handle.ref}
                          {...handle.attributes}
                          {...handle.listeners}
                          aria-label="Drag group to reorder"
                          className="flex shrink-0 cursor-grab touch-none items-center rounded-[var(--radius-md)] px-1 text-[var(--color-primary-text-on-subtle)] active:cursor-grabbing"
                        >
                          <GripVertical className="size-4" aria-hidden />
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleCollapse(gid)}
                          aria-label={collapsed ? "Expand group" : "Collapse group"}
                          className="text-[var(--color-primary-text-on-subtle)]"
                        >
                          {collapsed ? "▸" : "▾"}
                        </button>
                        <span className="text-[length:var(--text-small)] font-medium text-[var(--color-primary-text-on-subtle)]">⊞ Group screen</span>
                        <fieldset disabled={!canEdit} className="contents">
                          <GroupTitleInput value={group?.title ?? ""} onCommit={(t) => renameGroup(gid, t)} />
                        </fieldset>
                        {(conditionsQ.data ?? []).length > 0 ? (
                          <span className="flex flex-wrap items-center gap-2 text-[length:var(--text-small)] text-[var(--color-primary-text-on-subtle)]">
                            <span>Show if:</span>
                            {(conditionsQ.data ?? []).map((c) => {
                              const on = armsForGroup(gid).includes(c.slug);
                              return (
                                <label key={c.slug} className="flex cursor-pointer items-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={on}
                                    disabled={!canEdit}
                                    onChange={() => setGroupArm(gid, c.slug, !on)}
                                    className="size-3.5 accent-[var(--color-primary)]"
                                  />
                                  <span>{c.name}</span>
                                </label>
                              );
                            })}
                          </span>
                        ) : null}
                        {savingGroupId === gid ? (
                          <span className="flex items-center gap-1">
                            <input
                              autoFocus
                              value={moduleName}
                              onChange={(e) => setModuleName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && moduleName.trim())
                                  saveModuleMut.mutate({ studyId: study.id, groupId: gid, name: moduleName.trim() });
                                if (e.key === "Escape") setSavingGroupId(null);
                              }}
                              placeholder="Module name"
                              className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                            />
                            <button
                              type="button"
                              disabled={!moduleName.trim() || saveModuleMut.isPending}
                              onClick={() => saveModuleMut.mutate({ studyId: study.id, groupId: gid, name: moduleName.trim() })}
                              className="rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-white disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setSavingGroupId(null)}
                              className="text-[length:var(--text-small)] text-[var(--color-primary-text-on-subtle)]"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          (() => {
                            const sourceModule = group?.moduleId
                              ? (customModulesQ.data ?? []).find((m) => m.id === group.moduleId)
                              : null;
                            const btnCls =
                              "rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[length:var(--text-small)] text-[var(--color-primary-text-on-subtle)] hover:bg-[var(--color-primary-subtle)]";
                            if (!sourceModule) {
                              return (
                                <button
                                  type="button"
                                  disabled={!canEdit}
                                  onClick={() => {
                                    setSavingGroupId(gid);
                                    setModuleName(group?.title ?? "");
                                  }}
                                  title={canEdit ? "Save this group as a reusable module" : READ_ONLY_TITLE}
                                  className={cn(btnCls, "disabled:opacity-40")}
                                >
                                  ＋ Save as module
                                </button>
                              );
                            }
                            const changed = groupDiffersFromModule(gid, group?.title, sourceModule.definition);
                            return (
                              <span className="flex items-center gap-1">
                                {changed ? (
                                  <button
                                    type="button"
                                    disabled={!canEdit}
                                    onClick={() =>
                                      setConfirmUpdate({ moduleId: sourceModule.id, groupId: gid, name: sourceModule.name })
                                    }
                                    title={canEdit ? `Update the "${sourceModule.name}" module everywhere it's used` : READ_ONLY_TITLE}
                                    className={cn(btnCls, "disabled:opacity-40")}
                                  >
                                    ⤴ Update “{sourceModule.name}”
                                  </button>
                                ) : (
                                  <span className="text-[length:var(--text-small)] text-[var(--color-primary-text-on-subtle)] opacity-70">
                                    ✓ module “{sourceModule.name}”
                                  </span>
                                )}
                                <button
                                  type="button"
                                  disabled={!canEdit}
                                  onClick={() => {
                                    setSavingGroupId(gid);
                                    setModuleName(group?.title ?? "");
                                  }}
                                  className={cn(btnCls, "disabled:opacity-40")}
                                >
                                  Save as new
                                </button>
                              </span>
                            );
                          })()
                        )}
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => setConfirmRemoveGroup(gid)}
                          title={canEdit ? "Remove this group (and its blocks) from the study" : READ_ONLY_TITLE}
                          aria-label="Remove group from study"
                          className="ml-auto shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--color-primary-text-on-subtle)] hover:bg-[var(--color-primary-subtle)] hover:text-[var(--color-danger-text-on-subtle)] disabled:opacity-40"
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </div>
                    );
                  }

                  // A block row (lone or a group member). Grip drags it; drop it
                  // outside a group to ungroup, between members to join (ADR-0028).
                  const i = study.blocks.findIndex((x) => x.instanceId === id);
                  const b = study.blocks[i];
                  if (!b) return null;
                  const grouped = !!b.groupId;
                  const next = study.blocks[i + 1];
                  const isLastMember = grouped && (!next || next.groupId !== b.groupId);
                  const collapsed = grouped && collapsedGroups.has(b.groupId!);
                  const groupCls = grouped
                    ? cn("border-l-2 border-[var(--color-primary)] bg-[var(--color-primary-subtle)]/40 px-2", isLastMember && "rounded-b-[var(--radius-md)] pb-2")
                    : "mt-2 border-l-2 border-transparent pl-2";

                  // Collapsed member → thin one-liner (still draggable).
                  if (collapsed) {
                    return (
                      <div className={cn("flex items-center gap-1 py-0.5", groupCls)}>
                        <span
                          ref={handle.ref}
                          {...handle.attributes}
                          {...handle.listeners}
                          aria-label="Drag to reorder"
                          className="flex shrink-0 cursor-grab touch-none items-center rounded-[var(--radius-md)] px-1 text-[var(--color-text-muted)] active:cursor-grabbing"
                        >
                          <GripVertical className="size-3.5" aria-hidden />
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedId(b.instanceId)}
                          className="truncate text-left text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                        >
                          {b.title?.trim() || b.name}
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div className={cn("flex items-stretch gap-1", groupCls, grouped && "py-0.5")}>
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
                          divergence={divergenceBadges[b.instanceId]}
                          block={b}
                          selected={b.instanceId === selectedId}
                          onSelect={() => setSelectedId(b.instanceId)}
                          /* Grouped members are gated at the group level — don't repeat per-block conditions. */
                          conditionLabel={
                            grouped
                              ? ""
                              : summarizeCondition(
                                  conditionWithSources(
                                    b.showIf,
                                    b.branchRules,
                                    new Set(study.blocks.slice(0, i).map((x) => x.instanceId)),
                                  ),
                                  nameOf,
                                )
                          }
                        />
                      </div>
                      <div className="flex w-[84px] shrink-0 items-center justify-end">
                        {grouped ? (
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => ungroup(b.instanceId)}
                            title={canEdit ? "Remove from group" : READ_ONLY_TITLE}
                            className="rounded-[var(--radius-sm)] px-1.5 py-1 text-[length:var(--text-small)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-40"
                          >
                            Ungroup
                          </button>
                        ) : i > 0 ? (
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => groupWithAbove(i)}
                            title={canEdit ? "Show on the same screen as the block above" : READ_ONLY_TITLE}
                            className="rounded-[var(--radius-sm)] px-1.5 py-1 text-[length:var(--text-small)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-40"
                          >
                            Group ↑
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                }}
              </SortableList>
            )}

            <div className="self-start">
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                disabled={!canEdit}
                title={canEdit ? undefined : READ_ONLY_TITLE}
                className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-40"
              >
                <Plus className="size-4" aria-hidden />
                Add block
              </button>
            </div>
            {pickerOpen ? (
              <BlockLibraryModal
                pending={addBlock.isPending}
                onClose={() => setPickerOpen(false)}
                onDragStateChange={setLibraryDragging}
                onBulkInsert={handleBulkInsert}
                onInsert={(m) => addBlock.mutate({ studyId: study.id, ...m })}
                customModules={customModulesQ.data ?? []}
                insertingModule={insertModuleMut.isPending}
                onInsertCustomModule={(id) => insertModuleMut.mutate({ studyId: study.id, customModuleId: id })}
                onRemoveCustomModule={(id) => removeModuleMut.mutate({ id })}
                onTogglePublic={(id, isPublic) => setPublicMut.mutate({ id, isPublic })}
              />
            ) : null}
          </section>
        </div>
      </main>

      {/* Right context panel (or left, per the Settings preference) */}
      {panelSide === "right" ? (
        <PaneHandle pane={panelPane} dir={-1} label="Resize study panel" />
      ) : null}
      <aside
        style={{ width: panelPane.width }}
        className={`flex shrink-0 flex-col gap-4 self-start rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] p-4 ${panelSide === "left" ? "order-first" : ""}`}
      >
        {consentSelected && !selected ? (
          <fieldset disabled={!canEdit} className="contents">
            <ConsentEditor
              studyId={study.id}
              consent={study.consent}
              onClose={() => setConsentSelected(false)}
            />
          </fieldset>
        ) : (
        <>
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
              <button
                type="button"
                role="tab"
                aria-current={blockTab === "configure" ? "page" : undefined}
                onClick={() => setBlockTab("configure")}
                className={blockTab === "configure" ? tabActiveCls : tabIdleCls}
              >
                Configure
              </button>
              <button
                type="button"
                role="tab"
                aria-current={blockTab === "history" ? "page" : undefined}
                onClick={() => setBlockTab("history")}
                className={blockTab === "history" ? tabActiveCls : tabIdleCls}
              >
                History
              </button>
              {(
                [
                  ["Replications", "replications"],
                  ["Validation", "validation"],
                ] as const
              ).map(([label, tab]) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  onClick={() => {
                    setSelectedId(null);
                    setPanelTab(tab);
                  }}
                  className="rounded-[var(--radius-sm)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
                >
                  {label}
                </button>
              ))}
              <TabSoon label="Comments" />
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
              <button
                type="button"
                role="tab"
                onClick={() => setPanelTab("validation")}
                aria-current={panelTab === "validation" ? "page" : undefined}
                className={panelTab === "validation" ? tabActiveCls : tabIdleCls}
              >
                Validation
              </button>
              <TabSoon label="Comments" />
            </>
          )}
        </nav>

        {selected && blockTab === "history" ? (
          <BlockHistoryPanel studyId={study.id} instanceId={selected.instanceId} />
        ) : selected ? (
          <fieldset disabled={!canEdit} className="contents">
            <BlockProvenance studyId={study.id} instanceId={selected.instanceId} />
            {divergenceBadges[selected.instanceId] ? (
              <ReplicationConfigExtras
                studyId={study.id}
                instanceId={selected.instanceId}
                status={divergenceBadges[selected.instanceId]}
                note={selected.divergenceNote}
              />
            ) : null}
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
              onSaveAsModule={(name) =>
                saveBlockMut.mutate({ studyId: study.id, instanceId: selected.instanceId, name })
              }
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
            <button
              type="button"
              onClick={() => {
                removeBlock.mutate({ studyId: study.id, instanceId: selected.instanceId });
                setSelectedId(null);
                setPanelTab("details");
              }}
              className="flex items-center gap-1.5 self-start rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2.5 py-1 text-[length:var(--text-small)] font-medium text-[var(--color-danger-text-on-subtle)] hover:bg-[var(--color-danger-subtle)]"
            >
              <Trash2 className="size-3.5" aria-hidden />
              Delete block
            </button>
          </fieldset>
        ) : panelTab === "versions" ? (
          <fieldset disabled={!canEdit} className="contents">
            <VersionsPanel
              studyId={study.id}
              onRestored={(message) => {
                void invalidate();
                setSavedMsg(message);
              }}
            />
          </fieldset>
        ) : panelTab === "replications" ? (
          <ReplicationsPanel studyId={study.id} />
        ) : panelTab === "validation" ? (
          <ValidationPanel studyId={study.id} />
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

            <fieldset disabled={!canEdit} className="contents">
              <TagsSection studyId={study.id} tags={study.tags} />
            </fieldset>

            {/* Replication (ADR-0018, replications-tab.md): forkability is owner-only; anyone who can open the study can replicate it. */}
            <DetailRow label="Replication">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {currentUserId === study.ownerId ? (
                  <ForkableControl studyId={study.id} value={study.forkableBy} frozen={study.stage !== "draft"} />
                ) : null}
                <ReplicateButton studyId={study.id} />
              </div>
            </DetailRow>

            <fieldset disabled={!canEdit} className="contents">
              <ConditionsSection studyId={study.id} />
            </fieldset>
          </div>
        )}
        </>
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

      <ConfirmDialog
        open={confirmUpdate !== null}
        title={confirmUpdate ? `Update the “${confirmUpdate.name}” module?` : "Update module?"}
        body="This overwrites the saved module with this group, and updates every other draft study that uses it to match (their copies are replaced). To leave those studies as they are, choose “Save as new” instead."
        confirmLabel="Update everywhere"
        onConfirm={() => {
          if (confirmUpdate)
            updateModuleMut.mutate({
              moduleId: confirmUpdate.moduleId,
              studyId: study.id,
              groupId: confirmUpdate.groupId,
            });
        }}
        onCancel={() => setConfirmUpdate(null)}
      />

      <ConfirmDialog
        open={confirmRemoveGroup !== null}
        title="Remove this group from the study?"
        body="This deletes the group and all of its blocks from this study. Any saved module it came from is not affected."
        confirmLabel="Remove group"
        tone="danger"
        onConfirm={() => {
          if (confirmRemoveGroup) removeGroup(confirmRemoveGroup);
          setConfirmRemoveGroup(null);
        }}
        onCancel={() => setConfirmRemoveGroup(null)}
      />
    </>
  );
}

function BlockCard({
  block,
  selected,
  onSelect,
  conditionLabel,
  divergence,
}: {
  block: StudyBlock;
  selected: boolean;
  onSelect: () => void;
  conditionLabel?: string | null;
  /** Replication-mode badge (ADR-0039): this block differs from the original. */
  divergence?: "modified" | "added";
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
        <div className="flex items-center gap-2 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
          <span className="truncate">{block.title?.trim() || block.name}</span>
          {divergence ? (
            <span
              className={cn(
                "shrink-0 rounded-full px-1.5 py-0.5 text-[length:var(--text-small)] font-medium",
                divergence === "modified"
                  ? "bg-[var(--color-warning-subtle)] text-[var(--color-warning-text-on-subtle)]"
                  : "bg-[var(--color-success-subtle)] text-[var(--color-success-text-on-subtle)]",
              )}
              title="Compared with the original version pinned when you replicated"
            >
              {divergence === "modified" ? "～ modified" : "＋ added"}
            </span>
          ) : null}
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
