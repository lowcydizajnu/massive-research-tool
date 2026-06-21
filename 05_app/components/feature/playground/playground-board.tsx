"use client";

import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Lightbulb,
  Link as LinkIcon,
  MessageSquare,
  StickyNote,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { UploadButton } from "@/components/feature/builder/upload-button";
import { PendingButton, Spinner } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import type { PlaygroundCardDTO } from "@/server/trpc/routers/playground";

/**
 * Playground board (ADR-0059, workspace-playground.md). A shared grid of typed
 * cards for a study-not-yet-built. Reads/writes go through the `playground`
 * router; comments reuse the shared comment system (targetType "playground_card").
 * Phase 1 kinds: link · note · image/file · reference. Reorder is keyboard-first
 * (move up/down) — native pointer drag is a Phase-2 refinement.
 */
type Kind = "link" | "note" | "image" | "file" | "reference";

const KIND_META: Record<Kind, { label: string; icon: typeof LinkIcon; chip: string }> = {
  link: { label: "Link", icon: LinkIcon, chip: "primary" },
  note: { label: "Note", icon: StickyNote, chip: "accent" },
  image: { label: "Image", icon: ImageIcon, chip: "cond-3" },
  file: { label: "File", icon: FileText, chip: "cond-5" },
  reference: { label: "Reference", icon: Lightbulb, chip: "success" },
};

const chipClass = cn(
  "inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-0.5 text-[length:var(--text-small)] font-medium",
);

function chipStyle(token: string): React.CSSProperties {
  // The chip color maps to a named token pair (subtle bg + readable text).
  if (token === "primary")
    return { background: "var(--color-primary-subtle)", color: "var(--color-primary-text-on-subtle)" };
  if (token === "accent")
    return { background: "var(--color-accent-subtle)", color: "var(--color-accent-text-on-subtle)" };
  if (token === "success")
    return { background: "var(--color-success-subtle)", color: "var(--color-success-text-on-subtle)" };
  return { background: `var(--color-${token})`, color: `var(--color-${token}-text)` };
}

export function PlaygroundBoard() {
  const utils = api.useUtils();
  const active = api.workspace.active.useQuery();
  const board = api.playground.list.useQuery();
  const canEdit = (active.data?.role ?? "viewer") !== "viewer";

  const [adding, setAdding] = useState<Kind | null>(null);
  const [openComments, setOpenComments] = useState<string | null>(null);

  const invalidate = () => utils.playground.list.invalidate();

  const remove = api.playground.remove.useMutation({ onSuccess: invalidate });
  const reorder = api.playground.reorder.useMutation({ onSuccess: invalidate });

  const cards = board.data ?? [];

  function move(index: number, dir: -1 | 1) {
    const next = index + dir;
    if (next < 0 || next >= cards.length) return;
    const ids = cards.map((c) => c.id);
    [ids[index], ids[next]] = [ids[next], ids[index]];
    reorder.mutate({ orderedIds: ids });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Add toolbar */}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Add a card">
          <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">
            Add:
          </span>
          {(Object.keys(KIND_META) as Kind[]).map((k) => {
            const M = KIND_META[k];
            const Icon = M.icon;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setAdding(k)}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-body)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-subtle)]"
              >
                <Icon className="size-4" aria-hidden /> {M.label}
              </button>
            );
          })}
        </div>
      )}

      {adding && (
        <AddCardForm
          kind={adding}
          onClose={() => setAdding(null)}
          onSaved={() => {
            setAdding(null);
            invalidate();
          }}
        />
      )}

      {/* Board body */}
      {board.isLoading ? (
        <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">Loading board…</p>
      ) : board.isError ? (
        <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-danger-subtle)] p-4 text-[length:var(--text-body)] text-[var(--color-danger-text-on-subtle)]">
          Couldn’t load the board.
          <button type="button" className="underline" onClick={() => board.refetch()}>
            Retry
          </button>
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-10 text-center">
          <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
            Nothing here yet. Drop in a link, a question, an image, or a paper — then turn the keepers
            into a study.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Playground cards">
          {cards.map((card, i) => (
            <li key={card.id}>
              <PlaygroundCardView
                card={card}
                index={i}
                count={cards.length}
                canEdit={canEdit}
                onMove={move}
                onRemove={(id) => remove.mutate({ id })}
                onOpenComments={() => setOpenComments(card.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {openComments && (
        <CommentDrawer cardId={openComments} canEdit={canEdit} onClose={() => setOpenComments(null)} />
      )}
    </div>
  );
}

/* ---------------- card view ---------------- */

type CardDTO = PlaygroundCardDTO;

function PlaygroundCardView({
  card,
  index,
  count,
  canEdit,
  onMove,
  onRemove,
  onOpenComments,
}: {
  card: CardDTO;
  index: number;
  count: number;
  canEdit: boolean;
  onMove: (index: number, dir: -1 | 1) => void;
  onRemove: (id: string) => void;
  onOpenComments: () => void;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const convert = api.playground.convertToStudy.useMutation();
  const meta = KIND_META[(card.kind as Kind) ?? "note"] ?? KIND_META.note;
  const Icon = meta.icon;

  async function startStudy() {
    const { studyId } = await convert.mutateAsync({ id: card.id });
    await utils.playground.list.invalidate();
    router.push(`/studies/${studyId}` as never);
  }

  return (
    <article className="flex h-full flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4 shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between gap-2">
        <span className={chipClass} style={chipStyle(meta.chip)}>
          <Icon className="size-3.5" aria-hidden /> {meta.label}
        </span>
        {canEdit && (
          <div className="flex items-center gap-0.5">
            <IconBtn label="Move up" disabled={index === 0} onClick={() => onMove(index, -1)}>
              <ArrowUp className="size-4" />
            </IconBtn>
            <IconBtn label="Move down" disabled={index === count - 1} onClick={() => onMove(index, 1)}>
              <ArrowDown className="size-4" />
            </IconBtn>
            <IconBtn label="Archive card" onClick={() => onRemove(card.id)}>
              <Trash2 className="size-4" />
            </IconBtn>
          </div>
        )}
      </div>

      {card.title && (
        <h3 className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
          {card.title}
        </h3>
      )}

      <CardContent card={card} />

      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
        <div className="flex items-center gap-3 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          <button
            type="button"
            onClick={onOpenComments}
            className="inline-flex items-center gap-1 hover:text-[var(--color-text-primary)]"
          >
            <MessageSquare className="size-3.5" aria-hidden /> {card.commentCount}
            <span className="sr-only">comments</span>
          </button>
          <span>{card.createdByName}</span>
        </div>
        {canEdit &&
          (card.convertedStudyId ? (
            <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
              Started ✓
            </span>
          ) : (
            <PendingButton
              variant="secondary"
              pending={convert.isPending}
              onClick={startStudy}
              idleLabel={
                <span className="inline-flex items-center gap-1">
                  <Wand2 className="size-3.5" aria-hidden /> Start a study
                </span>
              }
              pendingLabel="Starting…"
              className="px-2.5 py-1 text-[length:var(--text-small)]"
            />
          ))}
      </div>
      {convert.isError && (
        <p className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
          {convert.error.message}
        </p>
      )}
    </article>
  );
}

function CardContent({ card }: { card: CardDTO }) {
  if (card.kind === "link" && card.url) {
    let domain = card.url;
    try {
      domain = new URL(card.url).hostname;
    } catch {
      /* keep raw */
    }
    return (
      <a
        href={card.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 break-all text-[length:var(--text-body)] text-[var(--color-primary)] hover:underline"
      >
        <ExternalLink className="size-4 shrink-0" aria-hidden />
        <span>{domain}</span>
      </a>
    );
  }
  if ((card.kind === "image" || card.kind === "file") && card.mediaKey) {
    if (card.kind === "image") {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.mediaKey}
          alt={card.title ?? "Uploaded image"}
          className="max-h-48 w-full rounded-[var(--radius-md)] object-cover"
        />
      );
    }
    return (
      <a
        href={card.mediaKey}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-[length:var(--text-body)] text-[var(--color-primary)] hover:underline"
      >
        <FileText className="size-4" aria-hidden /> Open file
      </a>
    );
  }
  if (card.kind === "reference" && card.refDoi) {
    return (
      <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
        {card.body && <span className="block text-[var(--color-text-primary)]">{card.body}</span>}
        <span className="break-all">DOI: {card.refDoi}</span>
      </p>
    );
  }
  if (card.body) {
    return (
      <p className="whitespace-pre-wrap text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
        {card.body}
      </p>
    );
  }
  return null;
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-[var(--radius-sm)] p-1 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-subtle)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/* ---------------- add card form ---------------- */

function AddCardForm({
  kind,
  onClose,
  onSaved,
}: {
  kind: Kind;
  onClose: () => void;
  onSaved: () => void;
}) {
  const create = api.playground.create.useMutation();
  const lookup = api.studyRecord.lookupCitation.useMutation();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [mediaKey, setMediaKey] = useState("");
  const [doi, setDoi] = useState("");
  const [error, setError] = useState<string | null>(null);
  const meta = KIND_META[kind];

  async function save() {
    setError(null);
    try {
      if (kind === "link") {
        if (!url.trim()) return setError("Paste a URL.");
        await create.mutateAsync({ kind, url: url.trim(), title: title.trim() || undefined });
      } else if (kind === "note") {
        if (!body.trim()) return setError("Write something.");
        await create.mutateAsync({ kind, title: title.trim() || undefined, body: body.trim() });
      } else if (kind === "image" || kind === "file") {
        if (!mediaKey) return setError("Upload a file first.");
        await create.mutateAsync({ kind, mediaKey, title: title.trim() || undefined });
      } else if (kind === "reference") {
        if (!doi.trim()) return setError("Paste a DOI.");
        // Resolve via the existing Crossref adapter; store the resolved label + DOI.
        let refTitle = title.trim();
        try {
          const cit = await lookup.mutateAsync({ doi: doi.trim() });
          refTitle = refTitle || cit?.title || "";
          await create.mutateAsync({
            kind,
            refDoi: doi.trim(),
            title: refTitle || undefined,
            body: cit?.citation || undefined,
          });
        } catch {
          // Lookup failed — still store the DOI so the card exists; mark unresolved.
          await create.mutateAsync({ kind, refDoi: doi.trim(), title: refTitle || undefined });
        }
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t add the card.");
    }
  }

  const busy = create.isPending || lookup.isPending;

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
          New {meta.label.toLowerCase()} card
        </h2>
        <IconBtn label="Cancel" onClick={onClose}>
          <X className="size-4" />
        </IconBtn>
      </div>

      {kind === "link" && (
        <Field label="URL">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className={inputCls}
          />
        </Field>
      )}
      {kind === "reference" && (
        <Field label="DOI">
          <input
            value={doi}
            onChange={(e) => setDoi(e.target.value)}
            placeholder="10.1037/…"
            className={inputCls}
          />
        </Field>
      )}
      {(kind === "image" || kind === "file") && (
        <Field label={kind === "image" ? "Image" : "File"}>
          {mediaKey ? (
            <span className="text-[length:var(--text-small)] text-[var(--color-success-text-on-subtle)]">
              Uploaded ✓
            </span>
          ) : (
            <UploadButton kind={kind === "image" ? "image" : "document"} onUploaded={setMediaKey} />
          )}
        </Field>
      )}
      {kind === "note" && (
        <Field label="Note or question">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="A thought, a question, a stimulus idea…"
            className={inputCls}
          />
        </Field>
      )}
      {kind !== "note" && (
        <Field label="Title (optional)">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        </Field>
      )}

      {error && (
        <p className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">{error}</p>
      )}
      <div className="flex items-center gap-2">
        <PendingButton pending={busy} onClick={save} idleLabel="Add to board" pendingLabel="Adding…" />
        <button
          type="button"
          onClick={onClose}
          className="text-[length:var(--text-body)] text-[var(--color-text-secondary)] hover:underline"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">
        {label}
      </span>
      {children}
    </label>
  );
}

/* ---------------- comments drawer ---------------- */

function CommentDrawer({
  cardId,
  canEdit,
  onClose,
}: {
  cardId: string;
  canEdit: boolean;
  onClose: () => void;
}) {
  const utils = api.useUtils();
  const thread = api.playground.listComments.useQuery({ cardId });
  const refresh = () => {
    utils.playground.listComments.invalidate({ cardId });
    utils.playground.list.invalidate();
  };
  const add = api.playground.addComment.useMutation({ onSuccess: refresh });
  const del = api.playground.deleteComment.useMutation({ onSuccess: refresh });
  const [body, setBody] = useState("");

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col gap-3 border-l border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-5 shadow-[var(--shadow-md)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Card comments"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-[length:var(--text-heading-2)] text-[var(--color-text-primary)]">
            Comments
          </h2>
          <IconBtn label="Close comments" onClick={onClose}>
            <X className="size-4" />
          </IconBtn>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto">
          {thread.isLoading ? (
            <Spinner className="size-5 text-[var(--color-text-secondary)]" />
          ) : (thread.data ?? []).length === 0 ? (
            <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
              No comments yet.
            </p>
          ) : (
            (thread.data ?? []).map((c) => (
              <div
                key={c.id}
                className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3"
              >
                <div className="mb-1 flex items-center justify-between text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                  <span>{c.authorName}</span>
                  <span>{c.status === "resolved" ? "Resolved" : ""}</span>
                </div>
                <p className="whitespace-pre-wrap text-[length:var(--text-body)] text-[var(--color-text-primary)]">
                  {c.bodyMd}
                </p>
                <div className="mt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => del.mutate({ commentId: c.id })}
                    className="text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:text-[var(--color-danger)]"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {canEdit && (
          <div className="flex flex-col gap-2 border-t border-[var(--color-border-subtle)] pt-3">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={2}
              placeholder="Add a comment…"
              className={inputCls}
            />
            <PendingButton
              pending={add.isPending}
              onClick={async () => {
                if (!body.trim()) return;
                await add.mutateAsync({ cardId, bodyMd: body.trim() });
                setBody("");
              }}
              idleLabel="Post"
              pendingLabel="Posting…"
              className="self-end px-3 py-1.5 text-[length:var(--text-body)]"
            />
          </div>
        )}
      </aside>
    </div>
  );
}
