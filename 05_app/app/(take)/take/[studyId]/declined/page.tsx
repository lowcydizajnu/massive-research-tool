import { Card, PreviewRibbon } from "@/components/feature/take/parts";
import { PanelRedirect } from "@/components/feature/take/panel-redirect";
import { resolveOpenRecruitment } from "@/server/runtime/participant";
import { fillPanelPlaceholders } from "@/lib/take/panel-integration";
import { DEFAULT_CONSENT } from "@/server/modules/consent";

/**
 * Declined-consent screen (ADR-0035, consent-screen.md): shown when a
 * participant chooses the disagree option on the consent page. Nothing is
 * recorded — they never began. A back link covers a change of mind. When the
 * study has an agency refusal redirect (ADR-0071) the participant is sent back
 * to the panel's screen-out URL (auto-redirect + sticky box); the skip-screen
 * case redirects from the consent page directly and never lands here.
 */
export default async function DeclinedPage({
  params,
  searchParams,
}: {
  params: Promise<{ studyId: string }>;
  searchParams: Promise<{ preview?: string; ext_id?: string }>;
}) {
  const { studyId } = await params;
  const sp = await searchParams;
  const open = await resolveOpenRecruitment(studyId);
  const message = open?.consent.declineMessage ?? DEFAULT_CONSENT.declineMessage;
  const preview = sp.preview === "true";

  // Agency screen-out redirect — only for real participants (never in preview).
  const panel = open?.panelIntegration;
  const refusal =
    panel?.refusalUrl && !preview
      ? {
          url: fillPanelPlaceholders(panel.refusalUrl, { extId: sp.ext_id ?? "", sessionId: "" }),
          delaySec: panel.refusalDelaySec,
          stickyText: panel.refusalStickyText,
        }
      : null;

  return (
    <Card>
      {preview ? <PreviewRibbon /> : null}
      {refusal ? <PanelRedirect url={refusal.url} delaySec={refusal.delaySec} stickyText={refusal.stickyText} /> : null}
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
      {refusal ? null : (
        <a
          href={`/take/${studyId}/start${preview ? "?preview=true" : ""}`}
          className="w-fit text-[length:var(--text-small)] text-[var(--color-text-secondary)] underline hover:opacity-80"
        >
          Changed your mind? Back to the study →
        </a>
      )}
    </Card>
  );
}
