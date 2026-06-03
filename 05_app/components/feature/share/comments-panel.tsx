"use client";

import { useRef, useState } from "react";

import { renderCommentMarkdown } from "@/lib/comment-markdown";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

/**
 * Comments tab for the Share stage (share-stage.md, ADR-0015). Flat thread for
 * the current target (whole study or a selected block) + a composer with
 * workspace-member @-mention autocomplete. Markdown is rendered with the
 * ADR-0015 allowlist (sanitized). Resolve/reopen by any writer; edit/delete by
 * the author.
 */
export function CommentsPanel({
  studyId,
  targetType,
  targetId,
  targetLabel,
  currentUserId,
}: {
  studyId: string;
  targetType: "study" | "block_instance";
  targetId: string;
  targetLabel: string;
  currentUserId: string;
}) {
  const utils = api.useUtils();
  const { data: comments } = api.comments.list.useQuery({
    experimentId: studyId,
    targetType,
    targetId,
  });
  const { data: members } = api.workspace.members.useQuery();
  const invalidate = () => void utils.comments.list.invalidate({ experimentId: studyId, targetType, targetId });

  const [body, setBody] = useState("");
  const [mentioned, setMentioned] = useState<Record<string, string>>({}); // userId → displayName
  const [menu, setMenu] = useState<{ query: string } | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const create = api.comments.create.useMutation({
    onSuccess: () => {
      setBody("");
      setMentioned({});
      setMenu(null);
      invalidate();
    },
  });
  const resolve = api.comments.resolve.useMutation({ onSuccess: invalidate });
  const del = api.comments.delete.useMutation({ onSuccess: invalidate });

  const memberList = members ?? [];
  const matches = menu
    ? memberList.filter((m) => m.displayName.toLowerCase().includes(menu.query.toLowerCase())).slice(0, 6)
    : [];

  function onBodyChange(v: string) {
    setBody(v);
    // Detect a trailing "@token" at the cursor to open the mention menu.
    const m = /(?:^|\s)@(\w*)$/.exec(v);
    setMenu(m ? { query: m[1] } : null);
  }

  function pickMention(userId: string, displayName: string) {
    // Replace the trailing "@token" with "@DisplayName " and track the id.
    setBody((b) => b.replace(/@(\w*)$/, `@${displayName} `));
    setMentioned((prev) => ({ ...prev, [userId]: displayName }));
    setMenu(null);
    taRef.current?.focus();
  }

  function submit() {
    const text = body.trim();
    if (!text) return;
    // Keep only mentions whose display name still appears in the body.
    const ids = Object.entries(mentioned)
      .filter(([, name]) => text.includes(`@${name}`))
      .map(([id]) => id);
    create.mutate({ experimentId: studyId, targetType, targetId, bodyMd: text, mentionedUserIds: ids });
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">Comments</h2>
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{targetLabel}</p>

      {comments && comments.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {comments.map((c) => (
            <li
              key={c.id}
              className={cn(
                "flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3",
                c.status === "resolved" && "opacity-60",
              )}
            >
              <div className="flex items-center justify-between gap-2 text-[length:var(--text-small)]">
                <span className="font-medium text-[var(--color-text-primary)]">{c.authorName}</span>
                <span className="text-[var(--color-text-muted)]">
                  {c.editedAt ? "edited · " : ""}
                  {c.status === "resolved" ? "Resolved" : ""}
                </span>
              </div>
              <div
                className="prose-comment text-[length:var(--text-body)] text-[var(--color-text-primary)] [&_a]:underline [&_code]:font-mono"
                // Sanitized by renderCommentMarkdown (DOMPurify + ADR-0015 allowlist).
                dangerouslySetInnerHTML={{ __html: renderCommentMarkdown(c.bodyMd) }}
              />
              <div className="flex gap-3 text-[length:var(--text-small)]">
                <button
                  type="button"
                  onClick={() => resolve.mutate({ commentId: c.id, resolved: c.status !== "resolved" })}
                  className="text-[var(--color-text-secondary)] hover:underline"
                >
                  {c.status === "resolved" ? "Reopen" : "Resolve"}
                </button>
                {c.authorUserId === currentUserId ? (
                  <button
                    type="button"
                    onClick={() => del.mutate({ commentId: c.id })}
                    className="text-[var(--color-danger-text-on-subtle)] hover:underline"
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          No comments yet — start the discussion.
        </p>
      )}

      {/* Composer */}
      <div className="relative flex flex-col gap-2">
        <textarea
          ref={taRef}
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          placeholder="Comment… use @ to mention a teammate"
          aria-label="Add a comment"
          rows={3}
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]"
        />
        {menu && matches.length > 0 ? (
          <ul className="absolute bottom-[44px] left-0 z-10 w-56 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] shadow-[var(--shadow-md)]">
            {matches.map((m) => (
              <li key={m.userId}>
                <button
                  type="button"
                  onClick={() => pickMention(m.userId, m.displayName)}
                  className="block w-full px-3 py-1.5 text-left text-[length:var(--text-body)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-subtle)]"
                >
                  {m.displayName}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <button
          type="button"
          onClick={submit}
          disabled={create.isPending || !body.trim()}
          className="w-fit rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-1.5 text-[length:var(--text-body-emphasis)] font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {create.isPending ? "Posting…" : "Comment"}
        </button>
      </div>
    </div>
  );
}
