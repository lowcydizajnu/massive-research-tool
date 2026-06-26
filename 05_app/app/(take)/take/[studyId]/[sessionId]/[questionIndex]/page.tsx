import Link from "next/link";
import type { Route } from "next";
import { notFound, redirect } from "next/navigation";

import { BlockView } from "@/components/feature/take/block-view";
import { Card, ScreenHeader } from "@/components/feature/take/parts";
import { getRuntimeScreen } from "@/server/runtime/participant";
import { effectivePresetKey, resolveChat } from "@/lib/themes/themes";
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

  return (
    <Card>
      <ScreenHeader
        position={s.position}
        total={s.total}
        preview={s.mode === "preview"}
        progress={s.theme.layout.progress}
        stepLabel={formatProgress(s.uiCopy.progressLabel, s.position + 1, s.total)}
      />

      <form action={answerAction} className="flex flex-col gap-[var(--take-block-gap,1.5rem)]">
        <input type="hidden" name="studyId" value={studyId} />
        <input type="hidden" name="responseId" value={sessionId} />
        <input type="hidden" name="questionIndex" value={index} />
        {s.screen.blocks.map((b) => {
          const prefix = isGroup ? `${b.instanceId}__` : "";
          return (
            <div key={b.instanceId}>
              <input type="hidden" name="blocks" value={`${b.instanceId}|${b.key}|${prefix}`} />
              <BlockView block={b} seed={sessionId} namePrefix={prefix} presetKey={effectivePresetKey(s.theme)} responseId={sessionId} chat={resolveChat(s.theme)} />
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
