/**
 * Cross-screen carry for persistent notifications (ADR-0095 am. 2026-07-06).
 *
 * A notification with `scope: "persist"` stays visible from its anchor screen
 * across subsequent screens until the participant dismisses it. The take flow is
 * a server-rendered MPA (each screen is a fresh render), so persistence lives in
 * `sessionStorage`, keyed by the response: the anchor block writes its config
 * when shown, and a page-level host re-renders it into the top bar on every later
 * screen. Same-tab only (sessionStorage) and cleared when the tab closes — which
 * matches a single participant run.
 *
 * `live` is an in-page registry of notification instances whose OWN block is
 * mounted on the current screen; the host skips those so the anchor screen never
 * double-renders (the block's banner + the host's banner). Purely client-side —
 * every function no-ops during SSR.
 */
export type CarriedNotification = { instanceId: string; config: Record<string, unknown> };

const storageKey = (responseId: string) => `mrt:notif-carry:${responseId}`;

const live = new Set<string>();
type Listener = () => void;
const listeners = new Set<Listener>();
function emit() {
  for (const l of listeners) l();
}

/** Subscribe to carry/live changes within this page. Returns an unsubscribe fn. */
export function subscribeCarry(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The anchor block marks itself live so the host skips it on this screen. */
export function registerLive(instanceId: string): void {
  live.add(instanceId);
  emit();
}
export function unregisterLive(instanceId: string): void {
  live.delete(instanceId);
  emit();
}
export function isLive(instanceId: string): boolean {
  return live.has(instanceId);
}

function readMap(responseId: string): Record<string, Record<string, unknown>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(storageKey(responseId));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(responseId: string, map: Record<string, Record<string, unknown>>): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(responseId), JSON.stringify(map));
  } catch {
    /* private-mode / quota — persistence degrades to this-screen only */
  }
  emit();
}

/** Remember a persistent notification so later screens can re-render it. */
export function setCarry(responseId: string, instanceId: string, config: Record<string, unknown>): void {
  if (!responseId || !instanceId) return;
  const map = readMap(responseId);
  map[instanceId] = config;
  writeMap(responseId, map);
}

/** Drop a persistent notification (participant dismissed it / clicked a CTA). */
export function clearCarry(responseId: string, instanceId: string): void {
  if (!responseId || !instanceId) return;
  const map = readMap(responseId);
  if (instanceId in map) {
    delete map[instanceId];
    writeMap(responseId, map);
  }
}

/** All notifications currently carried for this response. */
export function readCarries(responseId: string): CarriedNotification[] {
  return Object.entries(readMap(responseId)).map(([instanceId, config]) => ({ instanceId, config }));
}
