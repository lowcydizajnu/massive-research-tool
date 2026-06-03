import { Card, PreviewRibbon } from "@/components/feature/take/parts";
import { resolveOpenRecruitment } from "@/server/runtime/participant";

import { beginAction } from "../actions";

/**
 * Participant entry + consent (participant-runtime.md). Resolves the study's
 * open recruitment (latest preregistered version). `?preview=true` runs the
 * identical flow recording nothing; `?PROLIFIC_PID=...` carries the opaque
 * external id for dedup/payment reconciliation.
 */
export default async function StartPage({
  params,
  searchParams,
}: {
  params: Promise<{ studyId: string }>;
  searchParams: Promise<{ preview?: string; PROLIFIC_PID?: string; closed?: string }>;
}) {
  const { studyId } = await params;
  const sp = await searchParams;
  const open = await resolveOpenRecruitment(studyId);

  if (!open) {
    return (
      <Card>
        <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
          This study isn’t accepting responses right now.
        </h1>
        <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
          If you arrived from a recruitment link, the researcher may have paused or closed it.
        </p>
      </Card>
    );
  }

  const preview = sp.preview === "true";

  return (
    <Card>
      {preview ? <PreviewRibbon /> : null}
      <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
        {open.studyTitle}
      </h1>
      <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
        You’re about to take part in a research study. Participation is voluntary and you may stop
        at any time. Your responses are recorded anonymously and used for research.
      </p>
      {sp.closed ? (
        <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
          This study isn’t accepting responses right now.
        </p>
      ) : null}
      <form action={beginAction}>
        <input type="hidden" name="studyId" value={studyId} />
        <input type="hidden" name="recruitmentSessionId" value={open.recruitmentSessionId} />
        <input type="hidden" name="mode" value={preview ? "preview" : "run"} />
        {sp.PROLIFIC_PID ? (
          <input type="hidden" name="externalPid" value={sp.PROLIFIC_PID} />
        ) : null}
        <button
          type="submit"
          className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-5 py-2.5 text-[length:var(--text-body-emphasis)] font-medium text-white hover:opacity-90"
        >
          Begin
        </button>
      </form>
    </Card>
  );
}
