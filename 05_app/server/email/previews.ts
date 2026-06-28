import type { EmailSettings } from "@/server/db/schema";

import { appUrl, renderEmail } from "./templates";

/**
 * The two engagement emails, composed from the operator's editable copy (ADR-0081).
 * Shared by the workers (real sends) and the admin test-send (preview to self) so
 * the wording an operator edits is exactly what ships.
 */
export function digestEmail(s: EmailSettings, updates: number): { subject: string; html: string; text: string } {
  const plural = updates === 1 ? "" : "s";
  return {
    subject: s.digestSubject,
    ...renderEmail({
      heading: s.digestSubject,
      intro: s.digestIntroMd,
      bodyHtml: `<p style="margin:0 0 12px">You have <strong>${updates}</strong> new update${plural} across your workspaces this week.</p>`,
      cta: { label: "Open your activity", url: `${appUrl()}/activity` },
      textFallback: `You have ${updates} new update${plural} across your workspaces this week.`,
    }),
  };
}

export function nudgeEmail(s: EmailSettings): { subject: string; html: string; text: string } {
  return {
    subject: s.nudgeSubject,
    ...renderEmail({
      heading: s.nudgeSubject,
      intro: s.nudgeIntroMd,
      bodyHtml: `<p style="margin:0 0 12px">Your studies are right where you left them — jump back in whenever you're ready.</p>`,
      cta: { label: "Open your dashboard", url: `${appUrl()}/home` },
      textFallback: "Your studies are right where you left them.",
    }),
  };
}
