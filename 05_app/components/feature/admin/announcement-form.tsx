"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";

/**
 * Publish a "what's new" announcement (platform-foundation PF4). Owner-only
 * authoring form (the page is gated by the ADMIN_USER_IDS allow-list). Body is
 * short Markdown, rendered with the ADR-0015 allowlist in the reader widget.
 */
export function AnnouncementForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [learnMoreUrl, setLearnMoreUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = api.announcements.create.useMutation({
    onSuccess: () => {
      setTitle("");
      setBody("");
      setLearnMoreUrl("");
      setError(null);
      router.refresh();
    },
    onError: (e) => setError(e.message),
  });

  const inputCls =
    "rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim() || !body.trim()) return;
        create.mutate({
          title: title.trim(),
          body: body.trim(),
          learnMoreUrl: learnMoreUrl.trim() || undefined,
        });
      }}
      className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4"
    >
      <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">New announcement</h2>
      {error ? (
        <p role="alert" className="rounded-[var(--radius-md)] bg-[var(--color-danger-subtle)] px-3 py-2 text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
          {error}
        </p>
      ) : null}
      <input className={inputCls} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
      <textarea
        className={inputCls}
        rows={5}
        placeholder="Body (Markdown — keep it short)"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={4000}
        required
      />
      <input className={inputCls} type="url" placeholder="Learn-more URL (optional)" value={learnMoreUrl} onChange={(e) => setLearnMoreUrl(e.target.value)} maxLength={2000} />
      <PendingButton type="submit" pending={create.isPending} idleLabel="Publish" pendingLabel="Publishing…" className="self-start px-4 py-2" />
    </form>
  );
}
