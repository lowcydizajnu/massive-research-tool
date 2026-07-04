import Link from "next/link";
import type { Route } from "next";

/**
 * An opt-in public researcher, as surfaced on Explore's "Researchers to follow"
 * band and the personal `/researchers` directory (EE2, ADR-0077). PII-free —
 * only fields already shown on the public `/u/<handle>` profile, plus two
 * discovery counts. Fed by `explore.publicProfiles`.
 */
export type ShowcaseProfile = {
  handle: string;
  displayName: string;
  affiliation: string | null;
  researchAreas: string[];
  avatarKey: string | null;
  avatarUrl: string | null;
  studyCount: number;
  followerCount: number;
};

const CARD =
  "flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)]";

/**
 * Researcher discovery tile: avatar + name + affiliation + up to 3 research-area
 * chips + a "N studies · M followers" line. The whole card links to the public
 * profile. Shared by Explore's showcase band and the /researchers directory.
 */
export function ResearcherCard({ profile: p }: { profile: ShowcaseProfile }) {
  const avatarSrc = p.avatarKey ? `/api/media/${p.avatarKey}` : p.avatarUrl;
  return (
    <Link href={`/u/${p.handle}` as Route} className={`${CARD} p-4 transition-opacity hover:opacity-90`}>
      <div className="flex items-center gap-3">
        {avatarSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarSrc} alt="" className="size-11 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-subtle)] text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-primary-text-on-subtle)]">
            {(p.displayName.trim()[0] ?? "·").toUpperCase()}
          </span>
        )}
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
            {p.displayName}
          </span>
          {p.affiliation ? (
            <span className="truncate text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
              {p.affiliation}
            </span>
          ) : null}
        </div>
      </div>
      {p.researchAreas.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {p.researchAreas.slice(0, 3).map((area) => (
            <span
              key={area}
              className="rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)]"
            >
              {area}
            </span>
          ))}
        </div>
      ) : null}
      <span className="mt-3 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        {p.studyCount} {p.studyCount === 1 ? "study" : "studies"} · {p.followerCount}{" "}
        {p.followerCount === 1 ? "follower" : "followers"}
      </span>
    </Link>
  );
}
