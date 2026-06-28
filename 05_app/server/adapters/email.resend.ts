import type { EmailAdapter, EmailMessage, EmailResult } from "./email";

/**
 * Resend implementation of EmailAdapter (ADR-0081) — the ONLY file that talks to
 * Resend. Uses the REST API via `fetch` (no SDK dependency). Env-gated: with no
 * `RESEND_API_KEY` / `EMAIL_FROM` it reports `isConfigured()=false` and `send`
 * returns `{ ok:false }` without phoning home — so un-provisioned envs (and the
 * disabled-by-default workers) never send.
 */
const API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM;
const ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

export const resendEmail: EmailAdapter = {
  isConfigured() {
    return Boolean(API_KEY && FROM);
  },

  async send(msg: EmailMessage): Promise<EmailResult> {
    if (!API_KEY || !FROM) return { ok: false, error: "Email not configured (RESEND_API_KEY / EMAIL_FROM)" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM,
          to: [msg.to],
          subject: msg.subject,
          html: msg.html,
          ...(msg.text ? { text: msg.text } : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return { ok: false, error: `Resend ${res.status} ${detail}`.trim() };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Resend request failed" };
    } finally {
      clearTimeout(timer);
    }
  },
};
