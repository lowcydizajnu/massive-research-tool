/**
 * Study variables — participant-entered values reused in-run (ADR-0099).
 *
 * A value the participant enters in one block (first producer: the login
 * username) is carried forward for the rest of THIS run so it can personalise
 * later screens — a signed-in nav bar, `{username}` tokens in copy. The take flow
 * is a server-rendered MPA, so the carry lives in `sessionStorage`, keyed by the
 * response (same pattern as {@link ./notification-carry}).
 *
 * PRIVACY (ADR-0098 / ADR-0014): this is CLIENT-ONLY. The value is never sent to
 * the server, never stored in the DB, and never exported — it exists only in the
 * participant's own browser tab and is cleared when the tab closes. The login
 * inputs stay nameless, so nothing typed enters the form POST. Every function
 * no-ops during SSR.
 */
export type StudyVarState = {
  /** Named variables (e.g. `{ username: "cooluser" }`). */
  vars: Record<string, string>;
  /** Signed-in bar descriptor written by the login producer, or null if off. */
  bar: { template: string } | null;
};

const EMPTY: StudyVarState = { vars: {}, bar: null };

const storageKey = (responseId: string) => `mrt:study-vars:${responseId}`;

type Listener = () => void;
const listeners = new Set<Listener>();
function emit() {
  for (const l of listeners) l();
}

/** Subscribe to variable changes within this page. Returns an unsubscribe fn. */
export function subscribeVars(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

function read(responseId: string): StudyVarState {
  if (typeof window === "undefined" || !responseId) return EMPTY;
  try {
    const raw = window.sessionStorage.getItem(storageKey(responseId));
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return EMPTY;
    const vars =
      parsed.vars && typeof parsed.vars === "object" && !Array.isArray(parsed.vars)
        ? (parsed.vars as Record<string, string>)
        : {};
    const bar =
      parsed.bar && typeof parsed.bar === "object" && typeof parsed.bar.template === "string"
        ? { template: parsed.bar.template as string }
        : null;
    return { vars, bar };
  } catch {
    return EMPTY;
  }
}

function write(responseId: string, state: StudyVarState): void {
  if (typeof window === "undefined" || !responseId) return;
  try {
    window.sessionStorage.setItem(storageKey(responseId), JSON.stringify(state));
  } catch {
    /* private-mode / quota — the variable just doesn't carry */
  }
  emit();
}

/** All variables carried for this response (empty map before anything is set). */
export function getVars(responseId: string): Record<string, string> {
  return read(responseId).vars;
}

/** The signed-in bar descriptor for this response, or null. */
export function getBar(responseId: string): { template: string } | null {
  return read(responseId).bar;
}

/**
 * Set one variable (and optionally the signed-in bar). Called by the login
 * producer on submit, BEFORE it advances the screen — sessionStorage is
 * synchronous, so the value is durable across the navigation. A blank value is a
 * no-op (nothing to carry).
 */
export function setVar(responseId: string, name: string, value: string, bar?: { template: string } | null): void {
  if (!responseId || !name || !value) return;
  const state = read(responseId);
  const next: StudyVarState = {
    vars: { ...state.vars, [name]: value },
    bar: bar === undefined ? state.bar : bar,
  };
  write(responseId, next);
}

/** Drop all variables for this response. */
export function clearVars(responseId: string): void {
  if (typeof window === "undefined" || !responseId) return;
  try {
    window.sessionStorage.removeItem(storageKey(responseId));
  } catch {
    /* ignore */
  }
  emit();
}

/**
 * Replace `{name}` tokens with their variable values. Only KNOWN names are
 * substituted — unrelated braces in stimulus copy are left untouched. A function
 * replacer is used so a value containing `$` is inserted literally. Returns the
 * text unchanged when it has no resolvable token (the common case).
 */
export function interpolate(text: string, vars: Record<string, string>): string {
  if (!text || text.indexOf("{") === -1) return text;
  return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (m, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : m,
  );
}

/** True if `text` contains at least one resolvable `{name}` token. */
export function hasResolvableToken(text: string, vars: Record<string, string>): boolean {
  if (!text || text.indexOf("{") === -1) return false;
  let found = false;
  text.replace(/\{([a-zA-Z0-9_]+)\}/g, (m, key: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) found = true;
    return m;
  });
  return found;
}
