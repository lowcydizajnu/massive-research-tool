"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { ReactionKey } from "@/lib/themes/themes";
import { cn } from "@/lib/utils";
import {
  allRequirementsMet,
  EMPTY_TALLY,
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
}: {
  requirements: InteractionRequirement[];
  maxTimeSec: number;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const [tally, setTally] = useState<InteractionTally>(EMPTY_TALLY);
  const [remaining, setRemaining] = useState<number>(maxTimeSec > 0 ? maxTimeSec : 0);
  const [timedOut, setTimedOut] = useState(false);

  const met = timedOut || allRequirementsMet(requirements, tally);

  // Watch the screen form + re-tally on any interaction.
  useEffect(() => {
    const form = anchor.current?.closest("form");
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
  }, []);

  // Drive the screen's Continue button disabled state.
  useEffect(() => {
    const btn = anchor.current?.closest("form")?.querySelector<HTMLButtonElement>("[data-take-continue]");
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
          const btn = anchor.current?.closest("form")?.querySelector<HTMLButtonElement>("[data-take-continue]");
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
  }, [maxTimeSec]);

  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, "0");
  const chips = useMemo(() => requirements.filter((r) => r.count > 0), [requirements]);

  if (chips.length === 0 && maxTimeSec <= 0) return <div ref={anchor} className="hidden" />;

  return (
    <div ref={anchor} className="flex flex-col gap-2">
      {chips.length ? (
        <ul role="list" className="flex flex-wrap items-center gap-2">
          {chips.map((r) => {
            const done = requirementMet(r, tally);
            const have = Math.min(requirementProgress(r, tally), r.count);
            return (
              <li
                key={r.id}
                aria-label={`${requirementLabel(r)}, ${have} of ${r.count}${done ? ", done" : ""}`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[length:var(--text-small)]",
                  done
                    ? "border-[var(--color-success)] bg-[var(--color-success-subtle)] text-[var(--color-success-text-on-subtle)]"
                    : "border-[var(--color-border-subtle)] text-[var(--color-text-secondary)]",
                )}
              >
                <span aria-hidden>{done ? "✓" : "○"}</span>
                {requirementLabel(r)} {have}/{r.count}
              </li>
            );
          })}
        </ul>
      ) : null}
      {maxTimeSec > 0 && !timedOut ? (
        <span aria-live="off" className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Time remaining {mm}:{ss}
        </span>
      ) : null}
    </div>
  );
}
