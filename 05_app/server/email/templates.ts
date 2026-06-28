/**
 * Minimal, dependency-free email rendering (ADR-0081). One branded layout shared
 * by the digest + nudge + test-send. Intro copy is operator-editable plain text
 * (rendered as paragraphs, HTML-escaped — no markdown dependency); the body is a
 * pre-escaped HTML fragment the caller builds.
 */

/** Public app origin for links in emails (server runtime). */
export function appUrl(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.PRODUCTION_DOMAIN || "myresearchlab.app";
  return env.startsWith("http") ? env.replace(/\/$/, "") : `https://${env}`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Render operator plain-text copy into escaped <p> paragraphs (blank-line split). */
export function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 12px">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

export type RenderedEmail = { html: string; text: string };

/**
 * Build the full email. `bodyHtml` is trusted (caller-built) HTML; `intro` is
 * operator text (escaped here). A footer links to email settings (opt-out).
 */
export function renderEmail(opts: {
  heading: string;
  intro: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  textFallback: string;
}): RenderedEmail {
  const base = appUrl();
  const cta = opts.cta
    ? `<p style="margin:20px 0"><a href="${opts.cta.url}" style="background:#047144;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block;font-weight:600">${escapeHtml(opts.cta.label)}</a></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f6f4ee;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1b18">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#fff;border:1px solid #e7e3d8;border-radius:12px;padding:28px">
      <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;margin:0 0 16px;color:#1c1b18">${escapeHtml(opts.heading)}</h1>
      ${paragraphs(opts.intro)}
      ${opts.bodyHtml}
      ${cta}
    </div>
    <p style="font-size:12px;color:#8a857a;margin:16px 4px 0">
      You're receiving this from Massive Research Tool.
      <a href="${base}/settings" style="color:#8a857a">Manage email preferences</a>.
    </p>
  </div>
</body></html>`;
  const text = `${opts.heading}\n\n${opts.intro}\n\n${opts.textFallback}${
    opts.cta ? `\n\n${opts.cta.label}: ${opts.cta.url}` : ""
  }\n\nManage email preferences: ${base}/settings`;
  return { html, text };
}
