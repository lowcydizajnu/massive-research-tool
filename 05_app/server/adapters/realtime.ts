/**
 * RealtimeAdapter seam (ADR-0007 + ADR-0060) — the first realtime feature lands,
 * so the interface promised by ADR-0007 is drafted here. Feature code depends
 * ONLY on these abstract shapes (never vendor types), so the V1 DB-polling
 * implementation can be swapped for Liveblocks push (then Yjs) by changing the
 * `realtime` binding below — no feature-code change. See the lock-in inventory.
 *
 * Scope is deliberately small: ephemeral, non-authoritative PRESENCE (who's on a
 * study + which block they're focused on). Edits still flow through the normal
 * mutations under last-write-wins (ADR-0012); realtime never carries the
 * authoritative data.
 */
export type PresenceEntry = {
  userId: string;
  displayName: string;
  /** The block instanceId the collaborator is focused on, or null. */
  blockId: string | null;
  updatedAt: string;
};

export interface RealtimeAdapter {
  /** Record/refresh a collaborator's presence on a study (heartbeat). */
  heartbeat(input: { studyId: string; userId: string; blockId: string | null }): Promise<void>;
  /** Live collaborators on a study seen within `staleMs`, excluding `exceptUserId`. */
  listPresence(input: {
    studyId: string;
    exceptUserId?: string;
    staleMs?: number;
  }): Promise<PresenceEntry[]>;
  /** Drop a collaborator's presence row (on leave). */
  clear(input: { studyId: string; userId: string }): Promise<void>;
}

import { localRealtimeAdapter } from "@/server/adapters/realtime.local";

// V1: DB-heartbeat + polling, no vendor (ADR-0060). Swap to Liveblocks/Yjs here.
export const realtime: RealtimeAdapter = localRealtimeAdapter;
