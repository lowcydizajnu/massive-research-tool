"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useState, type CSSProperties, type DragEvent, type ReactNode } from "react";

/** Native-DnD drop support (library drag-to-position): when `active`, each row
 *  becomes an HTML5 drop target and `onDrop(rowId, e)` fires with the row the
 *  payload landed on. Coexists with dnd-kit (pointer events vs native DnD). */
export type NativeDrop = {
  active: boolean;
  onDrop: (rowId: string, e: DragEvent) => void;
};

/** Props to spread onto the drag-handle element (the grip). */
export type DragHandleProps = {
  ref: (el: HTMLElement | null) => void;
  attributes: Record<string, unknown>;
  listeners: Record<string, unknown> | undefined;
};

/**
 * Accessible, animated vertical sortable (ADR-0022, dnd-kit). The only dnd-kit
 * surface in the app besides its two consumers — the reorder result is a plain
 * `instanceId[]` handed to `onReorder`, so the data layer never sees dnd-kit.
 * `children(id, handle, isDragging)` renders each row; spread `handle` onto the
 * grip so only the grip starts a drag (the row stays clickable).
 */
export function SortableList({
  ids,
  onReorder,
  ariaLabel,
  className,
  children,
  nativeDrop,
  disabled = false,
  onDragStartId,
  onDragCancel,
  renderOverlay,
}: {
  ids: string[];
  onReorder: (ids: string[], movedId: string) => void;
  ariaLabel?: string;
  className?: string;
  children: (id: string, handle: DragHandleProps, isDragging: boolean) => ReactNode;
  nativeDrop?: NativeDrop;
  /** Read-only: render rows with inert handles, no drag, no native drop (T3.5 role gating). */
  disabled?: boolean;
  /** Fired with the row id when a drag begins (e.g. collapse a group on drag). */
  onDragStartId?: (id: string) => void;
  /** Fired when a drag ends WITHOUT a reorder (drop on self / cancelled). */
  onDragCancel?: () => void;
  /** Opt-in DragOverlay: render the dragged id as a floating chip so the drag is
   *  decoupled from the reflowing list (no pickup jump when rows collapse mid-drag).
   *  When provided, the source row ghosts in place instead of translating. */
  renderOverlay?: (id: string) => ReactNode;
}) {
  const [dropHover, setDropHover] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const overlay = !!renderOverlay;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Read-only: a plain list, each row handed an inert handle (no drag listeners).
  // (After the hooks above — rules-of-hooks forbids an early return before them.)
  if (disabled) {
    const inert: DragHandleProps = { ref: () => {}, attributes: {}, listeners: undefined };
    return (
      <ul aria-label={ariaLabel} className={className}>
        {ids.map((id) => (
          <li key={id}>{children(id, inert, false)}</li>
        ))}
      </ul>
    );
  }

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) {
      onDragCancel?.(); // dropped on self → no reorder; let the caller undo any drag-time collapse
      return;
    }
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) {
      onDragCancel?.();
      return;
    }
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorder(next, moved);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragStart={(e) => {
        setActiveId(String(e.active.id));
        onDragStartId?.(String(e.active.id));
      }}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        onDragCancel?.();
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul aria-label={ariaLabel} className={className}>
          {ids.map((id) => (
            <SortableRow
              key={id}
              id={id}
              overlay={overlay}
              nativeDrop={nativeDrop?.active ? nativeDrop : undefined}
              dropHover={dropHover === id}
              setDropHover={setDropHover}
            >
              {children}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
      {overlay ? (
        <DragOverlay modifiers={[restrictToVerticalAxis]} dropAnimation={null}>
          {activeId ? renderOverlay!(activeId) : null}
        </DragOverlay>
      ) : null}
    </DndContext>
  );
}

function SortableRow({
  id,
  children,
  overlay = false,
  nativeDrop,
  dropHover,
  setDropHover,
}: {
  id: string;
  children: (id: string, handle: DragHandleProps, isDragging: boolean) => ReactNode;
  /** DragOverlay mode: the active row ghosts in place; the overlay carries motion. */
  overlay?: boolean;
  nativeDrop?: NativeDrop;
  dropHover?: boolean;
  setDropHover?: (id: string | null) => void;
}) {
  const { setNodeRef, setActivatorNodeRef, transform, transition, isDragging, attributes, listeners } =
    useSortable({ id });
  // Translate only — never scale. dnd-kit otherwise puts scaleX/scaleY in the
  // transform to morph a dragged item to the size of the one it passes, which
  // vertically stretches a short row (e.g. a group header) over a tall card.
  // In overlay mode the DragOverlay renders the moving copy, so the source row
  // stays put (no transform) and just dims to mark its origin.
  const style: CSSProperties = {
    transform:
      overlay && isDragging
        ? undefined
        : transform
          ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
          : undefined,
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? (overlay ? 0.4 : 0.6) : 1,
    // Insertion indicator: the dragged library block lands AFTER this row.
    boxShadow: dropHover ? "inset 0 -3px 0 var(--color-primary)" : undefined,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      onDragOver={
        nativeDrop
          ? (e) => {
              e.preventDefault();
              setDropHover?.(id);
            }
          : undefined
      }
      onDragLeave={nativeDrop ? () => setDropHover?.(null) : undefined}
      onDrop={
        nativeDrop
          ? (e) => {
              e.preventDefault();
              setDropHover?.(null);
              nativeDrop.onDrop(id, e);
            }
          : undefined
      }
    >
      {children(
        id,
        {
          ref: setActivatorNodeRef,
          attributes: attributes as unknown as Record<string, unknown>,
          listeners: listeners as Record<string, unknown> | undefined,
        },
        isDragging,
      )}
    </li>
  );
}
