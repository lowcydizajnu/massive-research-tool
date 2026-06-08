"use client";

import { X } from "lucide-react";
import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

const fieldCls =
  "rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]";
const labelCls = "text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]";

/**
 * Account → Profile (V1.12 A2, account-settings.md). Researcher identity fields
 * reused by OSF preregistration metadata, the public author byline, and V1.13
 * Participants. Reads/writes via the `profile` tRPC router.
 */
export function ProfileForm() {
  const utils = api.useUtils();
  const query = api.profile.get.useQuery();
  const update = api.profile.update.useMutation({
    onSuccess: async () => {
      setSavedMsg("Profile saved.");
      setError(null);
      await utils.profile.get.invalidate();
    },
    onError: (e) => {
      setError(e.message);
      setSavedMsg(null);
    },
  });

  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<null | {
    displayName: string;
    fullName: string;
    affiliation: string;
    orcid: string;
    researchAreas: string[];
    bio: string;
    websiteUrl: string;
    scholarUrl: string;
  }>(null);
  const [areaInput, setAreaInput] = useState("");

  // Seed the editable draft once the query resolves.
  const p = query.data;
  const d =
    draft ??
    (p
      ? {
          displayName: p.displayName,
          fullName: p.fullName ?? "",
          affiliation: p.affiliation ?? "",
          orcid: p.orcid ?? "",
          researchAreas: p.researchAreas,
          bio: p.bio ?? "",
          websiteUrl: p.websiteUrl ?? "",
          scholarUrl: p.scholarUrl ?? "",
        }
      : null);

  if (!d) {
    return (
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading profile…</p>
    );
  }

  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => {
    setDraft({ ...d, [k]: v });
    setSavedMsg(null);
  };

  const addArea = () => {
    const v = areaInput.trim();
    if (v && !d.researchAreas.includes(v) && d.researchAreas.length < 20) {
      set("researchAreas", [...d.researchAreas, v]);
    }
    setAreaInput("");
  };

  const save = () =>
    update.mutate({
      displayName: d.displayName.trim() || undefined,
      fullName: d.fullName,
      affiliation: d.affiliation,
      orcid: d.orcid,
      researchAreas: d.researchAreas,
      bio: d.bio,
      websiteUrl: d.websiteUrl,
      scholarUrl: d.scholarUrl,
    });

  return (
    <section className="flex max-w-[640px] flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Display name">
          <input className={fieldCls} value={d.displayName} onChange={(e) => set("displayName", e.target.value)} />
        </Field>
        <Field label="Email">
          <input className={cn(fieldCls, "opacity-60")} value={p?.email ?? ""} readOnly disabled />
        </Field>
        <Field label="Full name" hint="Used on OSF preregistrations + your author byline">
          <input className={fieldCls} value={d.fullName} onChange={(e) => set("fullName", e.target.value)} />
        </Field>
        <Field label="ORCID iD" hint="XXXX-XXXX-XXXX-XXXX">
          <input
            className={fieldCls}
            value={d.orcid}
            placeholder="0000-0002-1825-0097"
            onChange={(e) => set("orcid", e.target.value)}
          />
        </Field>
      </div>

      <Field label="Affiliation" hint="Institution + department">
        <input className={fieldCls} value={d.affiliation} onChange={(e) => set("affiliation", e.target.value)} />
      </Field>

      <Field label="Research areas">
        <div className="flex flex-wrap items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-2">
          {d.researchAreas.map((a) => (
            <span
              key={a}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary-subtle)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-primary-text-on-subtle)]"
            >
              {a}
              <button type="button" aria-label={`Remove ${a}`} onClick={() => set("researchAreas", d.researchAreas.filter((x) => x !== a))}>
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
          <input
            className="min-w-[120px] flex-1 bg-transparent px-1 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-primary)] outline-none"
            placeholder="Add area + Enter"
            value={areaInput}
            onChange={(e) => setAreaInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addArea();
              }
            }}
            onBlur={addArea}
          />
        </div>
      </Field>

      <Field label="Bio" hint="Short markdown — shown on your public author page">
        <textarea className={cn(fieldCls, "min-h-[96px] resize-y")} value={d.bio} onChange={(e) => set("bio", e.target.value)} />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Website">
          <input className={fieldCls} value={d.websiteUrl} placeholder="https://…" onChange={(e) => set("websiteUrl", e.target.value)} />
        </Field>
        <Field label="Google Scholar">
          <input className={fieldCls} value={d.scholarUrl} placeholder="https://scholar.google.com/…" onChange={(e) => set("scholarUrl", e.target.value)} />
        </Field>
      </div>

      {error ? (
        <p role="alert" className="rounded-[var(--radius-md)] bg-[var(--color-danger-subtle)] px-3 py-2 text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
          {error}
        </p>
      ) : null}
      {savedMsg ? (
        <p role="status" className="text-[length:var(--text-small)] text-[var(--color-success-text-on-subtle)]">
          {savedMsg}
        </p>
      ) : null}

      <PendingButton pending={update.isPending} idleLabel="Save profile" pendingLabel="Saving…" onClick={save} className="self-start" />
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelCls}>{label}</span>
      {children}
      {hint ? <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{hint}</span> : null}
    </label>
  );
}
