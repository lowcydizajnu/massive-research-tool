import { Card, PreviewRibbon } from "@/components/feature/take/parts";
import { resolveOpenRecruitment } from "@/server/runtime/participant";
import { DEFAULT_CONSENT } from "@/server/modules/consent";

/**
 * Declined-consent screen (ADR-0035, consent-screen.md): shown when a
 * participant chooses the disagree option on the consent page. Nothing is
 * recorded — they never began. A back link covers a change of mind.
 */
export default async function DeclinedPage({
  params,
  searchParams,
}: {
  params: Promise<{ studyId: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { studyId } = await params;
  const sp = await searchParams;
  const open = await resolveOpenRecruitment(studyId);
  const message = open?.consent.declineMessage ?? DEFAULT_CONSENT.declineMessage;
  const preview = sp.preview === "true";

  return (
    <Card>
      {preview ? <PreviewRibbon /> : null}
      <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
        No problem.
      </h1>
      {message
        .split(/\n{2,}/)
        .filter((para) => para.trim())
        .map((para, i) => (
          <p key={i} className="whitespace-pre-line text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
            {para.trim()}
          </p>
        ))}
      <a
        href={`/take/${studyId}/start${preview ? "?preview=true" : ""}`}
        className="w-fit text-[length:var(--text-small)] text-[var(--color-text-secondary)] underline hover:opacity-80"
      >
        Changed your mind? Back to the study →
      </a>
    </Card>
  );
}
