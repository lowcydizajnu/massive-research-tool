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
        Your responses have been recorded. You may now close this tab.
      </p>
    </Card>
  );
}
