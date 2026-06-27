"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/trpc/react";
import { COOKIE_CONSENT_KEY } from "@/lib/legal/cookie-consent";
import { FEEDBACK_BODY_MAX, FEEDBACK_KINDS, FEEDBACK_KIND_LABEL, type FeedbackKind } from "@/lib/feedback";

/**
 * In-app feedback widget (platform-foundation PF2, ADR-0072).
 *
 * Floating button (bottom-right) + modal. Mounted in the authenticated (app)
 * shell only — never the participant runtime (/take/*, ADR-0014); guarded
 * defensively here too. Screenshot capture (html2canvas, loaded on demand) is
 * best-effort and never blocks the text submission. The screenshot checkbox
 * defaults OFF when cookie consent is "necessary only". PII (hashed UA, coarse
 * country, workspace) is added server-side, never trusted from the client.
 */
function parseStudyId(pathname: string): string | undefined {
  const m = pathname.match(/\/studies\/([0-9a-f-]{36})/i);
  return m?.[1];
}

export function FeedbackWidget() {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);

  if (pathname.startsWith("/take/")) return null;

  return (
    <>
      {!open ? (
        <button
          type="button"
          aria-label="Send feedback"
          title="Send feedback"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-primary)] bg-[var(--color-surface-panel)] text-[var(--color-primary)] shadow-[var(--shadow-md)] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] motion-reduce:transition-none"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9 9 0 0 1-4-1L3 20l1.5-4.5a8.38 8.38 0 0 1-1-4A8.5 8.5 0 0 1 12 3a8.38 8.38 0 0 1 8.5 8.5z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : null}
      {open ? <FeedbackModal pathname={pathname} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function FeedbackModal({ pathname, onClose }: { pathname: string; onClose: () => void }) {
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [body, setBody] = useState("");
  const [includeShot, setIncludeShot] = useState(true);
  const [showContext, setShowContext] = useState(false);
  const [phase, setPhase] = useState<"idle" | "sending" | "capturing" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = api.feedback.submit.useMutation();
  const confirmShot = api.feedback.confirmScreenshot.useMutation();

  const url = typeof window !== "undefined" ? window.location.href : "";
  const studyId = useMemo(() => parseStudyId(pathname), [pathname]);

  // Respect cookie consent: "necessary only" → screenshot defaults OFF.
  const [consentNecessaryOnly, setConsentNecessaryOnly] = useState(false);
  useEffect(() => {
    try {
      const c = window.localStorage.getItem(COOKIE_CONSENT_KEY);
      if (c === "necessary") {
        setConsentNecessaryOnly(true);
        setIncludeShot(false);
      }
    } catch {
      /* private mode — keep default */
    }
  }, []);

  // Esc closes (unless mid-flight).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase === "idle") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, onClose]);

  async function captureAndUpload(uploadUrl: string): Promise<boolean> {
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(document.body, { logging: false, useCORS: true });
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/png"));
      if (!blob) return false;
      const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": "image/png" }, body: blob });
      return put.ok;
    } catch {
      return false; // best-effort; never blocks the text feedback
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || phase !== "idle") return;
    setError(null);
    setPhase("sending");
    try {
      const wantsShot = includeShot;
      // Hide the modal during capture so the screenshot shows the page, not us.
      if (wantsShot) setPhase("capturing");
      const res = await submit.mutateAsync({
        kind,
        body: body.trim(),
        url,
        routeName: pathname,
        studyId,
        includeScreenshot: wantsShot,
      });
      if (wantsShot && res.screenshotUploadUrl) {
        const ok = await captureAndUpload(res.screenshotUploadUrl);
        if (ok) await confirmShot.mutateAsync({ feedbackId: res.feedbackId });
      }
      setPhase("done");
      setTimeout(onClose, 1100);
    } catch {
      setPhase("idle");
      setError("Couldn't send your feedback. Please try again.");
    }
  }

  // During capture, render nothing visible (the floating button is already gone)
  // so html2canvas snapshots the underlying page.
  if (phase === "capturing") return null;

  const chip = (active: boolean) =>
    `rounded-[var(--radius-md)] border px-2.5 py-1 text-[length:var(--text-small)] font-medium ${
      active
        ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
        : "border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
    }`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Send feedback"
      className="fixed inset-0 z-[65] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && phase === "idle") onClose();
      }}
    >
      <div className="w-full max-w-[480px] rounded-[var(--radius-lg)] bg-[var(--color-surface-canvas)] p-6 shadow-[var(--shadow-md)]">
        <h2 className="font-serif text-[length:var(--text-heading-2)] font-medium text-[var(--color-ink-deep)]">
          Send feedback
        </h2>

        {phase === "done" ? (
          <p role="status" className="mt-4 text-[length:var(--text-body)] text-[var(--color-success-text-on-subtle)]">
            Thanks — your feedback was sent.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
            {error ? (
              <p role="alert" className="rounded-[var(--radius-md)] bg-[var(--color-danger-subtle)] px-3 py-2 text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
                {error}
              </p>
            ) : null}

            <div role="radiogroup" aria-label="Feedback type" className="flex flex-wrap gap-2">
              {FEEDBACK_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => setKind(k)}
                  className={chip(kind === k)}
                >
                  {FEEDBACK_KIND_LABEL[k]}
                </button>
              ))}
            </div>

            <label className="flex flex-col gap-1">
              <span className="sr-only">Your feedback</span>
              <textarea
                rows={6}
                required
                maxLength={FEEDBACK_BODY_MAX}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="What's on your mind? Bugs, ideas, confusion — anything."
                className="resize-y rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </label>

            <label className="flex items-start gap-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
              <input
                type="checkbox"
                checked={includeShot}
                onChange={(e) => setIncludeShot(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
              />
              <span>
                Include a screenshot of this page
                {consentNecessaryOnly ? (
                  <span className="block text-[var(--color-text-muted)]">
                    Off by default because of your cookie choice — turn on to include one.
                  </span>
                ) : null}
              </span>
            </label>

            <div className="text-[length:var(--text-small)]">
              <button
                type="button"
                onClick={() => setShowContext((s) => !s)}
                aria-expanded={showContext}
                className="font-medium text-[var(--color-primary)] hover:opacity-90"
              >
                {showContext ? "Hide" : "Include"} browser context
              </button>
              {showContext ? (
                <pre className="mt-2 overflow-x-auto rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-2 text-[11px] text-[var(--color-text-muted)]">
{JSON.stringify({ url, route: pathname, studyId: studyId ?? null }, null, 2)}
{"\n"}+ coarse country, a one-way device hash, and your workspace are added securely on our server.
                </pre>
              ) : null}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={phase !== "idle"}
                className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-4 py-2 text-[length:var(--text-body)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!body.trim() || phase !== "idle"}
                className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-[length:var(--text-body)] font-medium text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-60"
              >
                {phase === "idle" ? "Send feedback" : "Sending…"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
