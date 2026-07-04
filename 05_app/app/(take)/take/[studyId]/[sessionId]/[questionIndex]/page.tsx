import Link from "next/link";
import type { Route } from "next";
import { notFound, redirect } from "next/navigation";

import { BlockView } from "@/components/feature/take/block-view";
import { InteractionGate } from "@/components/feature/take/interaction-gate";
import { RevealGate } from "@/components/feature/take/reveal-gate";
import { Card, ScreenHeader } from "@/components/feature/take/parts";
import { getRuntimeScreen } from "@/server/runtime/participant";
import { normalizeCondition } from "@/lib/whiteboard/conditions";
import { effectivePresetKey, isFeedSkin, resolveChat } from "@/lib/themes/themes";
import { formatProgress } from "@/lib/take/ui-copy";

import { answerAction } from "../../actions";

// System errors keep their fixed copy; the required-answer message is researcher-
// editable (uiCopy.requiredError) and substituted below.
const ERROR_COPY: Record<string, string> = {
  invalid_answer: "One of your answers wasn’t valid. Please check and try again.",
  throttled: "You’re going a little fast — pause a moment, then submit again.",
};

/**
 * One SCREEN per page (ADR-0028) — a question group (several blocks) or a single
 * block. RSC renders the screen + a form; Continue POSTs all the screen's
 * answers; Back navigates to the previous screen. Past the last visible screen
 * the runtime returns `done` → /complete.
 */
export default async function ScreenPage({
  params,
  searchParams,
}: {
  params: Promise<{ studyId: string; sessionId: string; questionIndex: string }>;
  searchParams: Promise<{ e?: string }>;
}) {
  const { studyId, sessionId, questionIndex } = await params;
  const index = Number(questionIndex);
  if (!Number.isInteger(index) || index < 0) notFound();

  const s = await getRuntimeScreen({ studyId, responseId: sessionId, screenIndex: index });
  if ("error" in s) notFound();
  if ("done" in s) redirect(`/take/${studyId}/${sessionId}/complete`);

  const errCode = (await searchParams).e;
  const errorMsg = errCode === "answer_required" ? s.uiCopy.requiredError : errCode ? ERROR_COPY[errCode] : null;
  const isGroup = s.screen.blocks.length > 1;
  // Same-screen sources for in-screen reveal (ADR-0088).
  const screenBlockIds = new Set(s.screen.blocks.map((b) => b.instanceId));
  // Feed mode: a social-feed skin + a screen that actually shows social posts →
  // drop the outer card so each post is its own unit on the page (owner 2026-07-01).
  const feed = isFeedSkin(s.theme) && s.screen.blocks.some((b) => b.key === "social-post");

  return (
    <Card flush={feed}>
      <ScreenHeader
        position={s.position}
        total={s.total}
        preview={s.mode === "preview"}
        progress={s.theme.layout.progress}
        stepLabel={formatProgress(s.uiCopy.progressLabel, s.position + 1, s.total)}
      />

      <form action={answerAction} data-take-form className="flex flex-col gap-[var(--take-block-gap,1.5rem)]">
        <input type="hidden" name="studyId" value={studyId} />
        <input type="hidden" name="responseId" value={sessionId} />
        <input type="hidden" name="questionIndex" value={index} />
        {s.screen.kind === "group" &&
        ((s.screen.interactionRequirements?.length ?? 0) > 0 || (s.screen.maxTimeSec ?? 0) > 0) ? (
          <InteractionGate
            requirements={s.screen.interactionRequirements ?? []}
            maxTimeSec={s.screen.maxTimeSec ?? 0}
            showSummary={s.screen.showRequirementSummary !== false}
            labels={s.uiCopy}
          />
        ) : null}
        {s.screen.blocks.map((b) => {
          const prefix = isGroup ? `${b.instanceId}__` : "";
          // In-screen reveal (ADR-0088): if this grouped block's condition targets
          // a SAME-SCREEN sibling, reveal it live via RevealGate instead of letting
          // the (ignored) screen gate hide nothing. Cross-screen clauses are handled
          // by the screen gate as before, so only same-screen clauses go client-side.
          const cond = isGroup ? normalizeCondition(b.showIf, b.branchRules) : null;
          const revealClauses = cond ? cond.clauses.filter((c) => screenBlockIds.has(c.fromInstanceId)) : [];
          const reveal = revealClauses.length ? { op: cond!.op, clauses: revealClauses } : null;
          const body = (
            <>
              <input type="hidden" name="blocks" value={`${b.instanceId}|${b.key}|${prefix}`} />
              <BlockView block={b} seed={sessionId} namePrefix={prefix} presetKey={effectivePresetKey(s.theme)} responseId={sessionId} chat={resolveChat(s.theme)} blockCopy={s.blockCopy} social={s.theme.socialPost} />
            </>
          );
          // In feed mode the outer Card is dropped so each social post floats as its
          // own unit — but that left the non-post question blocks bare on the grey
          // feed background. Give each non-social block its own white box so it reads
          // as a dedicated card (owner 2026-07-04). The social-post carries its own
          // <article> surface, so it's excluded here and never double-boxed.
          const boxed = feed && b.key !== "social-post";
          return (
            <div
              key={b.instanceId}
              className={
                boxed
                  ? "rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4 shadow-[var(--shadow-md)]"
                  : undefined
              }
            >
              {reveal ? <RevealGate condition={reveal}>{body}</RevealGate> : body}
            </div>
          );
        })}

        {errorMsg ? (
          <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
            {errorMsg}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          {index > 0 && s.theme.layout.backButton ? (
            <Link
              href={`/take/${studyId}/${sessionId}/${index - 1}` as Route}
              className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-4 py-2.5 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
            >
              {s.uiCopy.backButton}
            </Link>
          ) : null}
          <button
            type="submit"
            data-take-continue
            className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-5 py-2.5 text-[length:var(--text-body-emphasis)] font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {s.position + 1 >= s.total && !s.mayContinue ? s.uiCopy.finishButton : s.uiCopy.continueButton}
          </button>
        </div>
      </form>
    </Card>
  );
}
