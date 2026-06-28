import type { Metadata } from "next";

import { EmailSettingsForm } from "@/components/feature/admin/email-settings-form";

export const metadata: Metadata = { title: "Email · Admin" };

/**
 * Engagement-email controls (EE3 / ADR-0081). The digest + return-nudge workers
 * ship disabled; this is where an operator turns them on, sets the schedule, edits
 * the copy, and sends a test. Auth enforced by app/admin/layout.tsx.
 */
export default function AdminEmailPage() {
  return (
    <main className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
          Engagement email
        </h1>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          The weekly digest + return-nudge are off by default. Enable, schedule, and reword them here, then send
          yourself a test before going live.
        </p>
      </header>
      <EmailSettingsForm />
    </main>
  );
}
