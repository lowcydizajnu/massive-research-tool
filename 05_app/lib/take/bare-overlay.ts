/**
 * "Bare overlay" screen classification (ADR-0096 am. 2026-07-06). An imitation
 * surface block (modal / notification / login) placed ALONE on a screen is
 * chrome, not page content — so the take page drops the study card box around it
 * and renders it as its true self: a full-screen login takeover, a modal over the
 * previous screen, or a top-banner notification. Screen numbering is untouched
 * (each block is still its own screen) — this only changes how the screen renders.
 *
 * `only(key)` requires EVERY block on the screen to be that key, so a mixed screen
 * (e.g. login + a question) falls through to normal card rendering — the takeover
 * applies only when the block genuinely owns the screen.
 */
export type BareOverlay = {
  bareModal: boolean;
  bareLogin: boolean;
  bareNotification: boolean;
  bareOverlay: boolean;
};

export function classifyBareOverlay(blocks: { key: string }[]): BareOverlay {
  const only = (key: string) => blocks.length > 0 && blocks.every((b) => b.key === key);
  const bareModal = only("modal");
  const bareLogin = only("login");
  const bareNotification = only("notification");
  return { bareModal, bareLogin, bareNotification, bareOverlay: bareModal || bareLogin || bareNotification };
}

/** Keys that render as an overlay/chrome surface, never as inline page content —
 *  skipped when building the "previous screen" backdrop so overlays never stack. */
export const OVERLAY_KEYS = new Set(["modal", "notification", "login"]);
