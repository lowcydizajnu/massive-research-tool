import Link from "next/link";
import type { Route } from "next";
import { notFound, redirect } from "next/navigation";

import { BlockView } from "@/components/feature/take/block-view";
import { Card, PreviewRibbon, Progress } from "@/components/feature/take/parts";
import { getRuntimeScreen } from "@/server/runtime/participant";

import { answerAction } from "../../actions";

const ERROR_COPY: Record<string, string> = {
  answer_required: "Please answer every question on this page to continue.",
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

  const errorMsg = (await searchParams).e ? ERROR_COPY[(await searchParams).e!] : null;
  const isGroup = s.screen.blocks.length > 1;

  return (
    <Card>
      {s.mode === "preview" ? <PreviewRibbon /> : null}
      <div className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{s.studyTitle}</div>
      <Progress position={s.position} total={s.total} />

      {isGroup && s.screen.title ? (
        <h2 className="font-serif text-[length:var(--text-title)] font-medium text-[var(--color-text-primary)]">
          {s.screen.title}
        </h2>
      ) : null}

      <form action={answerAction} className="flex flex-col gap-6">
        <input type="hidden" name="studyId" value={studyId} />
        <input type="hidden" name="responseId" value={sessionId} />
        <input type="hidden" name="questionIndex" value={index} />
        {s.screen.blocks.map((b) => {
          const prefix = isGroup ? `${b.instanceId}__` : "";
          return (
            <div key={b.instanceId}>
              <input type="hidden" name="blocks" value={`${b.instanceId}|${b.key}|${prefix}`} />
              <BlockView block={b} seed={sessionId} namePrefix={prefix} />
            </div>
          );
        })}

        {errorMsg ? (
          <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
            {errorMsg}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          {index > 0 ? (
            <Link
              href={`/take/${studyId}/${sessionId}/${index - 1}` as Route}
              className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-4 py-2.5 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
            >
              Back
            </Link>
          ) : null}
          <button
            type="submit"
            className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-5 py-2.5 text-[length:var(--text-body-emphasis)] font-medium text-white hover:opacity-90"
          >
            {s.position + 1 >= s.total ? "Finish" : "Continue"}
          </button>
        </div>
      </form>
    </Card>
  );
}
