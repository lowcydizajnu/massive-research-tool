import { notFound } from "next/navigation";

import { Card, PreviewRibbon } from "@/components/feature/take/parts";
import { getCompletionInfo } from "@/server/runtime/participant";

/**
 * Terminal page (participant-runtime.md). Distinct preview variant so a
 * researcher is never confused about whether data was recorded. The Prolific
 * completion code/URL is surfaced here when configured (V1.6).
 */
export default async function CompletePage({
  params,
}: {
  params: Promise<{ studyId: string; sessionId: string }>;
}) {
  const { sessionId } = await params;
  const info = await getCompletionInfo(sessionId);
  if (!info) notFound();

  if (info.mode === "preview") {
    return (
      <Card>
        <PreviewRibbon />
        <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
          Preview complete
        </h1>
        <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
          You’ve reached the end of the study. Nothing was recorded — this was a preview. You can
          close this tab and return to your study.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
        Thank you
      </h1>
      <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
        Your responses have been recorded.{info.redirect ? "" : " You may now close this tab."}
      </p>
      {info.redirect ? (
        <div className="flex flex-col gap-2">
          {info.redirect.code ? (
            <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
              Your completion code: <span className="select-all font-mono font-medium text-[var(--color-text-primary)]">{info.redirect.code}</span>
            </p>
          ) : null}
          <a
            href={info.redirect.url}
            className="w-fit rounded-[var(--radius-md)] bg-[var(--color-primary)] px-5 py-2.5 text-[length:var(--text-body-emphasis)] font-medium text-white hover:opacity-90"
          >
            {info.redirect.label} →
          </a>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Takes you to {new URL(info.redirect.url).host}.</p>
        </div>
      ) : null}
    </Card>
  );
}
