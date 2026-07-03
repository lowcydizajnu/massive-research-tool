"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { ReactionKey } from "@/lib/themes/themes";
import { cn } from "@/lib/utils";
import {
  allRequirementsMet,
  EMPTY_TALLY,
  requirementEmoji,
  requirementLabel,
  requirementMet,
  requirementProgress,
  type InteractionRequirement,
  type InteractionTally,
} from "@/lib/whiteboard/interaction-requirements";

/**
 * Screen-level interaction gate (ADR-0087) — rendered at the top of a social-post
 * GROUP screen that has requirements and/or a time limit. Tallies interactions
 * across every social post on the screen by scanning the form's hidden inputs
 * (posts write `${np}liked/shared/reactionKey/comment/reply` — reactions are
 * button toggles that add/remove hidden nodes, so we watch the form with a
 * MutationObserver rather than input events), renders progress chips, and keeps
 * the screen's Continue (`[data-take-continue]`) disabled until every requirement
 * is met — or `maxTimeSec` elapses, which enables Continue and auto-advances.
 * Advisory only: it never changes what's recorded, just when you can proceed.
 */
function tallyFromForm(form: HTMLFormElement): InteractionTally {
  const t: InteractionTally = { ...EMPTY_TALLY, reactions: {} };
  const val = (el: Element) => (el as HTMLInputElement).value ?? "";
  const nonEmptyLines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean).length;

  form.querySelectorAll('input[name$="liked"]').forEach(() => (t.likes += 1));
  form.querySelectorAll('input[name$="disliked"]').forEach(() => (t.dislikes += 1));
  form.querySelectorAll('input[name$="shared"]').forEach(() => (t.shares += 1));
  form.querySelectorAll('input[name$="reported"]').forEach(() => (t.reports += 1));
  form.querySelectorAll('input[name$="reactionKey"]').forEach((el) => {
    const k = val(el) as ReactionKey;
    if (!k) return;
    t.reactions[k] = (t.reactions[k] ?? 0) + 1;
    if (k === "like") t.likes += 1;
  });
  // Composer comment inputs carry posted comments joined by newlines; each reply
  // input is one comment.
  form.querySelectorAll('input[name$="comment"]').forEach((el) => (t.comments += nonEmptyLines(val(el))));
  form.querySelectorAll('input[name$="reply"]').forEach((el) => {
    if (val(el).trim()) t.comments += 1;
  });
  return t;
}

export function InteractionGate({
  requirements,
  maxTimeSec,
  showSummary = true,
  labels,
}: {
  requirements: InteractionRequirement[];
  maxTimeSec: number;
  /** Show the requirement chips to the participant (ADR-0087 am.). Off ⇒ the gate
   *  still enforces Continue, the chips just don't render. */
  showSummary?: boolean;
  /** Resolved UI copy (uiCopy) for translatable requirement labels. */
  labels?: Partial<Record<string, string>>;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const [tally, setTally] = useState<InteractionTally>(EMPTY_TALLY);
  const [remaining, setRemaining] = useState<number>(maxTimeSec > 0 ? maxTimeSec : 0);
  const [timedOut, setTimedOut] = useState(false);
  // Page-level top-bar slot (rendered by the take layout under the fake nav). Null
  // until mounted → the bar renders in place as a graceful fallback.
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  const met = timedOut || allRequirementsMet(requirements, tally);

  // The screen form — located globally (the bar portals OUT of the form to the
  // page top-bar, so `closest` no longer reaches it) with an in-form anchor fallback.
  const getForm = () =>
    (typeof document !== "undefined" && document.querySelector<HTMLFormElement>("form[data-take-form]")) ||
    anchor.current?.closest("form") ||
    null;

  useEffect(() => {
    setSlot(document.getElementById("take-topbar"));
  }, []);

  // Watch the screen form + re-tally on any interaction.
  useEffect(() => {
    const form = getForm();
    if (!form) return;
    const recompute = () => setTally(tallyFromForm(form));
    recompute();
    const obs = new MutationObserver(recompute);
    obs.observe(form, { subtree: true, childList: true, attributes: true, characterData: true });
    form.addEventListener("input", recompute);
    return () => {
      obs.disconnect();
      form.removeEventListener("input", recompute);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot]);

  // Drive the screen's Continue button disabled state.
  useEffect(() => {
    const btn = getForm()?.querySelector<HTMLButtonElement>("[data-take-continue]");
    if (btn) btn.disabled = !met;
  }, [met]);

  // Countdown → on expiry, enable + auto-advance (submit the screen).
  useEffect(() => {
    if (maxTimeSec <= 0) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id);
          setTimedOut(true);
          const btn = getForm()?.querySelector<HTMLButtonElement>("[data-take-continue]");
          if (btn) {
            btn.disabled = false;
            btn.click();
          }
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxTimeSec]);

  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, "0");
  const chips = useMemo(() => requirements.filter((r) => r.count > 0), [requirements]);
  const showChips = showSummary && chips.length > 0;

  if (!showChips && maxTimeSec <= 0) return <div ref={anchor} className="hidden" />;

  const bar = (
    <div className="w-full border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] shadow-[var(--shadow-sm)]">
      {/* One tight row: emoji-led requirement chips + a compact countdown on the right. */}
      <div className="mx-auto flex w-full max-w-[600px] flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2">
        {showChips ? (
          <ul role="list" className="flex flex-1 flex-wrap items-center gap-1.5">
            {chips.map((r) => {
              const done = requirementMet(r, tally);
              const have = Math.min(requirementProgress(r, tally), r.count);
              const label = requirementLabel(r, labels);
              return (
                <li
                  key={r.id}
                  aria-label={`${label}, ${have} of ${r.count}${done ? ", done" : ""}`}
                  title={`${label} — ${have}/${r.count}`}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[length:var(--text-small)] leading-none",
                    done
                      ? "border-[var(--color-success)] bg-[var(--color-success-subtle)] text-[var(--color-success-text-on-subtle)]"
                      : "border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]",
                  )}
                >
                  <span aria-hidden>{requirementEmoji(r)}</span>
                  <span className="font-medium">{label}</span>
                  <span className="tabular-nums opacity-70">
                    {have}/{r.count}
                  </span>
                  {done ? (
                    <span aria-hidden className="text-[var(--color-success)]">
                      ✓
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        {maxTimeSec > 0 && !timedOut ? (
          <span
            aria-live="off"
            className="shrink-0 tabular-nums text-[length:var(--text-small)] text-[var(--color-text-muted)]"
          >
            ⏱ {mm}:{ss}
          </span>
        ) : null}
      </div>
    </div>
  );

  // Keep a 0-size anchor INSIDE the screen form (for form location fallback), and
  // render the visible bar into the page-level top-bar slot (portal) so it spans
  // the page like the nav instead of sitting inside a post card.
  return (
    <>
      <div ref={anchor} className="hidden" />
      {slot ? createPortal(bar, slot) : bar}
    </>
  );
}
