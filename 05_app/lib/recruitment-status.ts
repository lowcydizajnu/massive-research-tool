import type { ProviderStudyState } from "@/server/adapters/recruitment";

/**
 * Provider lifecycle state → researcher-facing badge label + token classes.
 * Shared by the Run-stage Prolific card and the Participants · Open-recruitment
 * card so the SAME study reads identically on both surfaces (V1.15 P2 fix).
 */
export const PROVIDER_STATE_BADGE: Record<ProviderStudyState, { label: string; cls: string }> = {
  active: { label: "Live on Prolific", cls: "bg-[var(--color-success-subtle)] text-[var(--color-success-text-on-subtle)]" },
  paused: { label: "Paused on Prolific", cls: "bg-[var(--color-warning-subtle)] text-[var(--color-warning-text-on-subtle)]" },
  awaiting_review: { label: "Recruited — awaiting review", cls: "bg-[var(--color-info-subtle)] text-[var(--color-info-text-on-subtle)]" },
  completed: { label: "Completed on Prolific", cls: "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]" },
  unpublished: { label: "Not yet live", cls: "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]" },
  unknown: { label: "On Prolific", cls: "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]" },
};
