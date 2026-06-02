"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/trpc/react";

/**
 * Editable study title (build-stage-builder-mode.md). Click to edit; Enter or
 * blur commits via studies.updateTitle (autosave); Esc cancels. The first
 * client-side tRPC mutation — exercises the HTTP client + React Query.
 */
export function EditableStudyTitle({
  studyId,
  initialTitle,
}: {
  studyId: string;
  initialTitle: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialTitle);

  const updateTitle = api.studies.updateTitle.useMutation({
    onSuccess: (res) => {
      setTitle(res.title);
      router.refresh(); // refresh the subtitle's "Edited …"
    },
  });

  function commit() {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === title) {
      setDraft(title);
      return;
    }
    setTitle(next);
    updateTitle.mutate({ id: studyId, title: next });
  }

  if (editing) {
    return (
      <input
        autoFocus
        aria-label="Study title"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(title);
            setEditing(false);
          }
        }}
        className="w-full rounded-[var(--radius-md)] border border-[var(--color-primary)] bg-[var(--color-surface-canvas)] px-2 py-1 font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
      />
    );
  }

  return (
    <button
      type="button"
      aria-label="Study title"
      onClick={() => {
        setDraft(title);
        setEditing(true);
      }}
      className="rounded-[var(--radius-md)] text-left font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-subtle)]"
    >
      {title}
    </button>
  );
}
