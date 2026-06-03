"use client";

import { useState } from "react";

import { FollowButton } from "@/components/feature/follow/follow-button";
import { api } from "@/lib/trpc/react";

/**
 * Study-level tags (ADR-0017, follow-affordances.md) in the Builder Details
 * panel. Free-form labels normalized server-side to slugs; each tag chip pairs
 * the slug with a tag +Follow affordance (you can follow a research area even
 * on your own study). Writes via studies.setTags + invalidates the study.
 */
export function TagsSection({ studyId, tags }: { studyId: string; tags: string[] }) {
  const utils = api.useUtils();
  const [draft, setDraft] = useState("");
  const setTags = api.studies.setTags.useMutation({
    onSuccess: () => void utils.studies.get.invalidate({ id: studyId }),
  });

  const add = () => {
    const t = draft.trim();
    if (!t) return;
    setTags.mutate({ studyId, tags: [...tags, t] });
    setDraft("");
  };
  const remove = (slug: string) =>
    setTags.mutate({ studyId, tags: tags.filter((x) => x !== slug) });

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
        Tags
      </span>
      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <li
              key={t}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-subtle)] py-0.5 pl-2 pr-1 text-[length:var(--text-small)]"
            >
              <span className="text-[var(--color-text-secondary)]">#{t}</span>
              <FollowButton
                targetType="tag"
                targetId={t}
                name={`the ${t} tag`}
                className="border-0 bg-transparent px-1 py-0 hover:underline"
              />
              <button
                type="button"
                onClick={() => remove(t)}
                aria-label={`Remove tag ${t}`}
                className="px-1 text-[var(--color-text-muted)] hover:text-[var(--color-danger-text-on-subtle)]"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          No tags yet — label this study so others can follow the topic.
        </p>
      )}
      <div className="flex gap-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add a tag…"
          aria-label="Add a tag"
          className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[length:var(--text-small)] text-[var(--color-text-primary)]"
        />
        <button
          type="button"
          onClick={add}
          disabled={setTags.isPending || !draft.trim()}
          className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2 py-1 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-60"
        >
          Add
        </button>
      </div>
    </div>
  );
}
