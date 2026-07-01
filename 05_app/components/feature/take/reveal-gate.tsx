"use client";

import { useEffect, useRef, useState } from "react";

import { evaluateCondition, type ConditionGroup } from "@/lib/whiteboard/conditions";

/**
 * In-screen conditional reveal (ADR-0088). Wraps a grouped block whose `showIf`
 * references a SAME-SCREEN sibling: the block is hidden until the sibling's live
 * state satisfies the condition, then revealed in place — progressive disclosure
 * within one screen (e.g. a video appears once the participant reacts to the post
 * above it). Reveal-and-stay (v1): once shown it stays shown, so a
 * partially-entered answer is never discarded.
 *
 * While hidden, the children (incl. the block's `blocks` marker input + its
 * fields) are UNMOUNTED, so the server never sees the block — a never-revealed
 * required block can't trip required-answer validation and records nothing.
 *
 * Source state is reconstructed from the screen form's hidden inputs (social-post
 * interactions: `${sid}__reactionKey/liked/shared/reported`), shaped so the
 * shared `evaluateCondition` treats it like the recorded answer. v1 supports
 * social-post triggers (the owner's case); other trigger types simply stay
 * un-revealed (safe — the block just doesn't show).
 */
function reconstructAnswers(form: HTMLFormElement, sourceIds: string[]): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const sid of sourceIds) {
    const q = (suffix: string) => form.querySelector<HTMLInputElement>(`[name="${sid}__${suffix}"]`);
    const reactionKey = q("reactionKey")?.value || null;
    const liked = !!q("liked") || reactionKey != null;
    const shared = !!q("shared");
    const reported = !!q("reported");
    answers[sid] = { liked, shared, reported, ...(reactionKey ? { reaction: reactionKey } : {}) };
  }
  return answers;
}

export function RevealGate({
  condition,
  children,
}: {
  condition: ConditionGroup;
  children: React.ReactNode;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);
  const sourceIds = Array.from(new Set(condition.clauses.map((c) => c.fromInstanceId)));

  useEffect(() => {
    if (revealed) return; // reveal-and-stay
    const form = anchor.current?.closest("form");
    if (!form) return;
    const check = () => {
      if (evaluateCondition(condition, reconstructAnswers(form, sourceIds))) setRevealed(true);
    };
    check();
    const obs = new MutationObserver(check);
    obs.observe(form, { subtree: true, childList: true, attributes: true, characterData: true });
    form.addEventListener("input", check);
    return () => {
      obs.disconnect();
      form.removeEventListener("input", check);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  return <div ref={anchor}>{revealed ? children : null}</div>;
}
