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
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties, ReactNode } from "react";

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
}: {
  ids: string[];
  onReorder: (ids: string[], movedId: string) => void;
  ariaLabel?: string;
  className?: string;
  children: (id: string, handle: DragHandleProps, isDragging: boolean) => ReactNode;
}) {
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
            <SortableRow key={id} id={id}>
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
}: {
  id: string;
  children: (id: string, handle: DragHandleProps, isDragging: boolean) => ReactNode;
}) {
  const { setNodeRef, setActivatorNodeRef, transform, transition, isDragging, attributes, listeners } =
    useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <li ref={setNodeRef} style={style}>
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
