import { resendEmail } from "./email.resend";

/**
 * EmailAdapter (ADR-0081) — the portable boundary for transactional/engagement
 * email. Feature code (jobs, the admin test-send) imports `email` from here only;
 * the vendor (Resend) lives behind `email.resend.ts`. Swapping ESPs = one file.
 */
export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type EmailResult = { ok: boolean; error?: string };

export interface EmailAdapter {
  /** True when the adapter has the credentials to actually send. */
  isConfigured(): boolean;
  /** Send one email. NEVER throws — returns `{ ok:false, error }` on failure. */
  send(msg: EmailMessage): Promise<EmailResult>;
}

export const email: EmailAdapter = resendEmail;
