"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/trpc/react";

/**
 * Admin engagement-email form (EE3 / ADR-0081). Local state seeded from the saved
 * settings; one Save applies the whole patch; per-feature test-send previews the
 * exact copy to the operator's own address. Both features default OFF.
 */

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const CARD =
  "flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-5";
const LABEL = "text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]";
const INPUT =
  "rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2.5 py-1.5 text-[length:var(--text-body)] text-[var(--color-text-primary)]";
const BTN =
  "inline-flex items-center rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-[length:var(--text-body-emphasis)] font-medium text-white hover:opacity-90 disabled:opacity-50";
const BTN_SECONDARY =
  "inline-flex items-center rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-50";

type FormState = {
  digestEnabled: boolean;
  digestDayOfWeek: number;
  digestHourUtc: number;
  digestSubject: string;
  digestIntroMd: string;
  nudgeEnabled: boolean;
  nudgeDormantDays: number;
  nudgeWindowDays: number;
  nudgeCooldownDays: number;
  nudgeSubject: string;
  nudgeIntroMd: string;
};

export function EmailSettingsForm() {
  const utils = api.useUtils();
  const q = api.admin.emailSettings.useQuery();
  const [form, setForm] = useState<FormState | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [testNote, setTestNote] = useState<string | null>(null);

  useEffect(() => {
    if (q.data && !form) {
      const d = q.data;
      setForm({
        digestEnabled: d.digestEnabled,
        digestDayOfWeek: d.digestDayOfWeek,
        digestHourUtc: d.digestHourUtc,
        digestSubject: d.digestSubject,
        digestIntroMd: d.digestIntroMd,
        nudgeEnabled: d.nudgeEnabled,
        nudgeDormantDays: d.nudgeDormantDays,
        nudgeWindowDays: d.nudgeWindowDays,
        nudgeCooldownDays: d.nudgeCooldownDays,
        nudgeSubject: d.nudgeSubject,
        nudgeIntroMd: d.nudgeIntroMd,
      });
    }
  }, [q.data, form]);

  const save = api.admin.updateEmailSettings.useMutation({
    onSuccess: () => {
      setSavedNote("Saved.");
      void utils.admin.emailSettings.invalidate();
      setTimeout(() => setSavedNote(null), 2500);
    },
  });
  const test = api.admin.sendTestEmail.useMutation({
    onSuccess: (r) => setTestNote(r.ok ? "Test email sent — check your inbox." : `Failed: ${r.error ?? "unknown"}`),
    onError: () => setTestNote("Failed to send test email."),
  });

  if (!form) return <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading…</p>;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const configured = q.data?.emailConfigured ?? false;

  return (
    <div className="flex flex-col gap-4">
      {!configured ? (
        <p
          role="alert"
          className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3 text-[length:var(--text-small)] text-[var(--color-text-secondary)]"
        >
          Email isn&rsquo;t configured yet — set <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code>. You can edit
          settings now; sends (and tests) stay disabled until it&rsquo;s set.
        </p>
      ) : null}

      {/* Weekly digest */}
      <section className={CARD}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-serif text-[length:var(--text-title)] font-medium text-[var(--color-text-primary)]">
            Weekly digest
          </h2>
          <label className="flex items-center gap-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            <input type="checkbox" checked={form.digestEnabled} onChange={(e) => set("digestEnabled", e.target.checked)} />
            Enabled
          </label>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Day (UTC)</span>
            <select className={INPUT} value={form.digestDayOfWeek} onChange={(e) => set("digestDayOfWeek", Number(e.target.value))}>
              {DAYS.map((d, i) => (
                <option key={d} value={i}>{d}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Hour (UTC, 0–23)</span>
            <input type="number" min={0} max={23} className={`${INPUT} w-24`} value={form.digestHourUtc} onChange={(e) => set("digestHourUtc", Number(e.target.value))} />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Subject</span>
          <input className={INPUT} value={form.digestSubject} onChange={(e) => set("digestSubject", e.target.value)} maxLength={160} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Intro</span>
          <textarea className={`${INPUT} min-h-20`} value={form.digestIntroMd} onChange={(e) => set("digestIntroMd", e.target.value)} maxLength={2000} />
        </label>
        <div className="flex items-center gap-2">
          <button type="button" className={BTN_SECONDARY} disabled={!configured || test.isPending} onClick={() => { setTestNote(null); test.mutate({ kind: "digest" }); }}>
            Send me a test
          </button>
        </div>
      </section>

      {/* Return nudge */}
      <section className={CARD}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-serif text-[length:var(--text-title)] font-medium text-[var(--color-text-primary)]">
            Return nudge
          </h2>
          <label className="flex items-center gap-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            <input type="checkbox" checked={form.nudgeEnabled} onChange={(e) => set("nudgeEnabled", e.target.checked)} />
            Enabled
          </label>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Dormant after (days)</span>
            <input type="number" min={1} max={365} className={`${INPUT} w-28`} value={form.nudgeDormantDays} onChange={(e) => set("nudgeDormantDays", Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Window (days)</span>
            <input type="number" min={1} max={365} className={`${INPUT} w-28`} value={form.nudgeWindowDays} onChange={(e) => set("nudgeWindowDays", Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Cooldown (days)</span>
            <input type="number" min={1} max={365} className={`${INPUT} w-28`} value={form.nudgeCooldownDays} onChange={(e) => set("nudgeCooldownDays", Number(e.target.value))} />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Subject</span>
          <input className={INPUT} value={form.nudgeSubject} onChange={(e) => set("nudgeSubject", e.target.value)} maxLength={160} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Intro</span>
          <textarea className={`${INPUT} min-h-20`} value={form.nudgeIntroMd} onChange={(e) => set("nudgeIntroMd", e.target.value)} maxLength={2000} />
        </label>
        <div className="flex items-center gap-2">
          <button type="button" className={BTN_SECONDARY} disabled={!configured || test.isPending} onClick={() => { setTestNote(null); test.mutate({ kind: "nudge" }); }}>
            Send me a test
          </button>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button type="button" className={BTN} disabled={save.isPending} onClick={() => { setSavedNote(null); save.mutate(form); }}>
          {save.isPending ? "Saving…" : "Save settings"}
        </button>
        {savedNote ? <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{savedNote}</span> : null}
        {testNote ? <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{testNote}</span> : null}
      </div>
    </div>
  );
}
