import { notFound, redirect } from "next/navigation";

import { BlockView } from "@/components/feature/take/block-view";
import { Card, PreviewRibbon, Progress } from "@/components/feature/take/parts";
import { getRuntimeQuestion } from "@/server/runtime/participant";

import { answerAction } from "../../actions";

const ERROR_COPY: Record<string, string> = {
  answer_required: "Please answer this question to continue.",
  invalid_answer: "That answer wasn’t valid. Please try again.",
};

/**
 * One question per page (participant-runtime.md, ADR-0013). RSC renders the
 * block + a form; Continue is a POST → server action → redirect. Past the last
 * visible block the runtime returns `done` and we redirect to /complete.
 */
export default async function QuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ studyId: string; sessionId: string; questionIndex: string }>;
  searchParams: Promise<{ e?: string }>;
}) {
  const { studyId, sessionId, questionIndex } = await params;
  const index = Number(questionIndex);
  if (!Number.isInteger(index) || index < 0) notFound();

  const q = await getRuntimeQuestion({ studyId, responseId: sessionId, questionIndex: index });
  if ("error" in q) notFound();
  if ("done" in q) redirect(`/take/${studyId}/${sessionId}/complete`);

  const errorMsg = (await searchParams).e ? ERROR_COPY[(await searchParams).e!] : null;

  return (
    <Card>
      {q.mode === "preview" ? <PreviewRibbon /> : null}
      <div className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
        {q.studyTitle}
      </div>
      <Progress position={q.position} total={q.total} />

      <form action={answerAction} className="flex flex-col gap-5">
        <input type="hidden" name="studyId" value={studyId} />
        <input type="hidden" name="responseId" value={sessionId} />
        <input type="hidden" name="questionIndex" value={index} />

        <BlockView block={q.block} />

        {errorMsg ? (
          <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
            {errorMsg}
          </p>
        ) : null}

        <button
          type="submit"
          className="w-fit rounded-[var(--radius-md)] bg-[var(--color-primary)] px-5 py-2.5 text-[length:var(--text-body-emphasis)] font-medium text-white hover:opacity-90"
        >
          {q.position + 1 >= q.total ? "Finish" : "Continue"}
        </button>
      </form>
    </Card>
  );
}
