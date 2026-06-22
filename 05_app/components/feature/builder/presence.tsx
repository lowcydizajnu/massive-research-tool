"use client";

import { Pencil } from "lucide-react";
import { useEffect, useRef } from "react";

import { api } from "@/lib/trpc/react";
import { useVisibleInterval } from "@/lib/use-visible-interval";
import { cn } from "@/lib/utils";
import type { PresenceEntry } from "@/server/adapters/realtime";

/** Presence heartbeat + poll cadence (ADR-0060) — faster than the 20s comment poll. */
const PRESENCE_POLL_MS = 5_000;

/**
 * Live-cooperation presence (ADR-0060). Heartbeats my focused block on a short
 * interval (+ immediately when it changes), polls the other collaborators, and
 * drops my presence on unmount. Returns the OTHERS on this study. Backed by the
 * presence router → RealtimeAdapter (DB polling in V1; Liveblocks/Yjs later).
 */
export function usePresence(studyId: string, blockId: string | null, enabled = true): PresenceEntry[] {
  const heartbeat = api.presence.heartbeat.useMutation();
  const leave = api.presence.leave.useMutation();
  // Refs so the keep-alive interval always sends the latest block without re-arming.
  const hbRef = useRef(heartbeat);
  hbRef.current = heartbeat;
  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  const blockRef = useRef(blockId);
  blockRef.current = blockId;

  const list = api.presence.list.useQuery(
    { studyId },
    { enabled, refetchInterval: useVisibleInterval(PRESENCE_POLL_MS), refetchOnWindowFocus: true },
  );

  // Beat immediately when the focused block changes.
  useEffect(() => {
    if (!enabled) return;
    hbRef.current.mutate({ studyId, blockId });
  }, [studyId, blockId, enabled]);

  // Keep-alive interval + leave on unmount.
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => hbRef.current.mutate({ studyId, blockId: blockRef.current }), PRESENCE_POLL_MS);
    return () => {
      clearInterval(t);
      leaveRef.current.mutate({ studyId });
    };
  }, [studyId, enabled]);

  return enabled ? (list.data ?? []) : [];
}

/* ---------- presentation ---------- */

const PALETTE = ["cond-1", "cond-2", "cond-3", "cond-4", "cond-5", "cond-6"];

/** Deterministic color token per user, so a person keeps their color across views. */
export function presenceColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Dot({ user, size = "md" }: { user: PresenceEntry; size?: "sm" | "md" }) {
  const c = presenceColor(user.userId);
  return (
    <span
      title={user.displayName}
      aria-label={user.displayName}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-medium ring-2 ring-[var(--color-surface-canvas)]",
        size === "sm" ? "size-5 text-[10px]" : "size-6 text-[length:var(--text-small)]",
      )}
      style={{ background: `var(--color-${c})`, color: `var(--color-${c}-text)` }}
    >
      {initials(user.displayName)}
    </span>
  );
}

/** Avatar cluster of other collaborators on the study (Builder top bar). */
export function PresenceAvatars({ users }: { users: PresenceEntry[] }) {
  if (users.length === 0) return null;
  const shown = users.slice(0, 4);
  const extra = users.length - shown.length;
  return (
    <span className="flex items-center" aria-label={`${users.length} collaborator${users.length === 1 ? "" : "s"} online`}>
      <span className="flex -space-x-1.5">
        {shown.map((u) => (
          <Dot key={u.userId} user={u} />
        ))}
      </span>
      {extra > 0 && (
        <span className="ml-1 text-[length:var(--text-small)] text-[var(--color-text-muted)]">+{extra}</span>
      )}
    </span>
  );
}

/** Per-block "who's editing" badge — initials of collaborators focused on a block. */
export function BlockEditorsBadge({ users }: { users: PresenceEntry[] }) {
  if (users.length === 0) return null;
  return (
    <span className="pointer-events-none absolute -right-1.5 -top-1.5 z-10 flex -space-x-1.5">
      {users.slice(0, 3).map((u) => (
        <Dot key={u.userId} user={u} size="sm" />
      ))}
    </span>
  );
}

/**
 * Soft-lock banner for the Configure panel (ADR-0060): tells the editor that
 * someone else is on this block, so an edit may overwrite theirs (last-write-wins).
 */
export function BlockLockBanner({ users }: { users: PresenceEntry[] }) {
  if (users.length === 0) return null;
  const names =
    users.length === 1
      ? users[0].displayName
      : `${users.slice(0, -1).map((u) => u.displayName).join(", ")} and ${users[users.length - 1].displayName}`;
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-warning)] bg-[var(--color-warning-subtle)] px-3 py-2 text-[length:var(--text-small)] text-[var(--color-warning-text-on-subtle)]"
    >
      <Pencil className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        <strong>{names}</strong> {users.length === 1 ? "is" : "are"} also editing this block. Saving
        will overwrite each other (last change wins) — coordinate to avoid losing work.
      </span>
    </p>
  );
}

/** The ring color to outline a block another collaborator is focused on. */
export function blockOutlineStyle(users: PresenceEntry[]): React.CSSProperties | undefined {
  if (users.length === 0) return undefined;
  const c = presenceColor(users[0].userId);
  return { boxShadow: `0 0 0 2px var(--color-${c})`, borderRadius: "var(--radius-md)" };
}
