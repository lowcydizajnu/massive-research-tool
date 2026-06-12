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
}: {
  ids: string[];
  onReorder: (ids: string[], movedId: string) => void;
  ariaLabel?: string;
  className?: string;
  children: (id: string, handle: DragHandleProps, isDragging: boolean) => ReactNode;
  nativeDrop?: NativeDrop;
}) {
  const [dropHover, setDropHover] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
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
      onDragEnd={onDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul aria-label={ariaLabel} className={className}>
          {ids.map((id) => (
            <SortableRow
              key={id}
              id={id}
              nativeDrop={nativeDrop?.active ? nativeDrop : undefined}
              dropHover={dropHover === id}
              setDropHover={setDropHover}
            >
              {children}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  children,
  nativeDrop,
  dropHover,
  setDropHover,
}: {
  id: string;
  children: (id: string, handle: DragHandleProps, isDragging: boolean) => ReactNode;
  nativeDrop?: NativeDrop;
  dropHover?: boolean;
  setDropHover?: (id: string | null) => void;
}) {
  const { setNodeRef, setActivatorNodeRef, transform, transition, isDragging, attributes, listeners } =
    useSortable({ id });
  // Translate only — never scale. dnd-kit otherwise puts scaleX/scaleY in the
  // transform to morph a dragged item to the size of the one it passes, which
  // vertically stretches a short row (e.g. a group header) over a tall card.
  const style: CSSProperties = {
    transform: transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` : undefined,
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.6 : 1,
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
