"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { handleIssue, normalizeHandle } from "@/lib/profile/handle";
import { api } from "@/lib/trpc/react";

/**
 * Settings · Account → Public profile (EE2, ADR-0077; settings-public-profile.md).
 * Opt-in toggle + handle picker (live availability) + bio. Default off. Avatar
 * upload is a follow-up; the public page falls back to the account avatar.
 */
export function PublicProfileSection() {
  const utils = api.useUtils();
  const { data } = api.profile.getPublic.useQuery();

  const [hydrated, setHydrated] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [savedHandle, setSavedHandle] = useState<string | null>(null);

  useEffect(() => {
    if (data && !hydrated) {
      setEnabled(data.publicProfileEnabled);
      setHandle(data.handle ?? "");
      setBio(data.bio ?? "");
      setSavedHandle(data.handle ?? null);
      setHydrated(true);
    }
  }, [data, hydrated]);

  const normalized = normalizeHandle(handle);
  const localIssue = normalized ? handleIssue(normalized) : null;

  // Debounce the handle before hitting the availability endpoint.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(normalized), 350);
    return () => clearTimeout(t);
  }, [normalized]);
  const avail = api.profile.checkHandleAvailable.useQuery(
    { handle: debounced },
    { enabled: debounced.length >= 3 && !localIssue },
  );

  const save = api.profile.updatePublic.useMutation({
    onSuccess: (res) => {
      setSavedHandle(res.handle);
      void utils.profile.getPublic.invalidate();
    },
  });

  const handleUnavailable = !localIssue && avail.data && !avail.data.available;
  const canSave =
    !save.isPending &&
    !localIssue &&
    !handleUnavailable &&
    (!enabled || normalized.length >= 3); // can't enable without a handle

  return (
    <section className="flex flex-col gap-3 border-t border-[var(--color-border-subtle)] pt-4">
      <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">Public profile</h2>
      <label className="flex items-center gap-2 text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Make my profile public
      </label>
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Off by default. Your workspace activity is never public — only the studies and templates you&rsquo;ve already shared publicly.
      </p>

      {enabled ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="pp-handle" className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">Handle</label>
            <input
              id="pp-handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              onBlur={() => setHandle(normalized)}
              placeholder="your-handle"
              className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-1.5 text-[length:var(--text-body)] text-[var(--color-text-primary)]"
            />
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]" aria-live="polite">
              {normalized ? `myresearchlab.app/u/${normalized}` : "Pick a handle for your public URL."}
              {localIssue ? ` — ${localIssue}` : handleUnavailable ? " — that handle is taken." : avail.data?.available ? " — available" : ""}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="pp-bio" className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">Bio</label>
            <textarea
              id="pp-bio"
              value={bio}
              maxLength={1000}
              rows={3}
              onChange={(e) => setBio(e.target.value)}
              className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-1.5 text-[length:var(--text-body)] text-[var(--color-text-primary)]"
            />
            <span className="self-end text-[length:var(--text-small)] text-[var(--color-text-muted)]">{bio.length}/1000</span>
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <PendingButton
          pending={save.isPending}
          idleLabel="Save"
          pendingLabel="Saving…"
          disabled={!canSave}
          onClick={() =>
            save.mutate({
              publicProfileEnabled: enabled,
              handle: normalized || undefined,
              bio,
            })
          }
        />
        {savedHandle ? (
          <Link href={`/u/${savedHandle}` as Route} target="_blank" className="text-[length:var(--text-small)] text-[var(--color-primary)] hover:underline">
            View your public profile ↗
          </Link>
        ) : null}
        {save.error ? (
          <span role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">{save.error.message}</span>
        ) : null}
      </div>
    </section>
  );
}
