import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db/client";
import { experiment, experimentVersion, follow, user, workspaceTemplate } from "@/server/db/schema";
import { publicProcedure, router } from "@/server/trpc/trpc";

/**
 * Explore destination data (EE1.3, ADR-0076). All `publicProcedure` — the same
 * payloads feed the authed `/explore` and the public `/explore` route, so they
 * must return only public, PII-free fields (ADR-0014). Explore is a curated
 * layer over the V1.8 Browse infra; these reuse its "public study" predicate.
 */
export const exploreRouter = router({
  /** App-shipped starter templates, surfaced by popularity (handoff EE1). */
  featuredTemplates: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(24).default(6) }).default({ limit: 6 }))
    .query(async ({ input }) => {
      return db
        .select({
          id: workspaceTemplate.id,
          name: workspaceTemplate.name,
          description: workspaceTemplate.description,
          coverImageR2Key: workspaceTemplate.coverImageR2Key,
          useCount: workspaceTemplate.useCount,
        })
        .from(workspaceTemplate)
        .where(
          and(
            eq(workspaceTemplate.starter, true),
            eq(workspaceTemplate.shareScope, "public"),
            isNull(workspaceTemplate.deletedAt),
          ),
        )
        .orderBy(desc(workspaceTemplate.useCount))
        .limit(input.limit);
    }),

  /** Recent public studies — same discoverability rule as Browse (ADR-0018/0055). */
  communityStudies: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(24).default(8) }).default({ limit: 8 }))
    .query(async ({ input }) => {
      const replicationCount = sql<number>`(select count(*)::int from ${experiment} c where c.fork_of_experiment_id = ${experiment.id})`;
      return db
        .select({
          id: experiment.id,
          title: experiment.title,
          tags: experiment.tags,
          authorName: user.displayName,
          replicationCount,
        })
        .from(experiment)
        .leftJoin(user, eq(experiment.ownerId, user.id))
        .where(
          and(
            eq(experiment.forkableBy, "public"),
            isNull(experiment.archivedAt),
            eq(experiment.isDemo, false),
            sql`exists (select 1 from ${experimentVersion} v where v.experiment_id = ${experiment.id} and v.kind in ('published','preregistered'))`,
          ),
        )
        .orderBy(desc(experiment.createdAt))
        .limit(input.limit);
    }),

  /**
   * Opt-in researcher profiles for the showcase band (EE2, ADR-0077): public
   * profiles that have at least one publicly-discoverable study. Returns only
   * PII-free fields already shown on the public profile page (ADR-0014): the
   * handle, display name, affiliation, research areas, public avatar, plus two
   * discovery counts (public studies + followers). Ordered by popularity
   * (followers, then studies) so the most-followed researchers surface first.
   */
  publicProfiles: publicProcedure
    // max 100 so the personal /researchers directory can request a full page
    // (the Explore showcase band asks for 12); over-max input else throws (crashed
    // /researchers when it passed 48, owner 2026-07-04).
    .input(z.object({ limit: z.number().int().min(1).max(100).default(8) }).default({ limit: 8 }))
    .query(async ({ input }): Promise<ShowcaseRow[]> => {
      // Counts are computed in separate grouped queries and merged in JS rather
      // than as subqueries correlated to `user`: pglite (the hermetic test DB)
      // does not correlate the reserved-word `user` table inside a subquery.
      // These queries only correlate to `experiment` (which pglite handles) or
      // don't correlate at all, so they behave identically in test and prod.
      const studyRows = await db
        .select({ ownerId: experiment.ownerId, n: sql<number>`count(*)::int` })
        .from(experiment)
        .where(
          and(
            eq(experiment.forkableBy, "public"),
            isNull(experiment.archivedAt),
            eq(experiment.isDemo, false),
            sql`exists (select 1 from ${experimentVersion} v where v.experiment_id = ${experiment.id} and v.kind in ('published','preregistered'))`,
          ),
        )
        .groupBy(experiment.ownerId);
      const studyCountByOwner = new Map(studyRows.map((r) => [r.ownerId, r.n]));

      const followRows = await db
        .select({ targetId: follow.targetId, n: sql<number>`count(*)::int` })
        .from(follow)
        .where(eq(follow.targetType, "author"))
        .groupBy(follow.targetId);
      const followerByAuthor = new Map(followRows.map((r) => [r.targetId, r.n]));

      const candidates = await db
        .select({
          id: user.id,
          handle: user.handle,
          displayName: user.displayName,
          affiliation: user.affiliation,
          researchAreas: user.researchAreas,
          avatarKey: user.publicAvatarR2Key,
          avatarUrl: user.avatarUrl,
        })
        .from(user)
        .where(and(eq(user.publicProfileEnabled, true), sql`${user.handle} is not null`));

      return candidates
        .flatMap((c): ShowcaseRow[] => {
          if (c.handle === null) return [];
          const studyCount = studyCountByOwner.get(c.id) ?? 0;
          if (studyCount === 0) return []; // must have >=1 publicly-discoverable study
          return [
            {
              handle: c.handle,
              displayName: c.displayName,
              affiliation: c.affiliation,
              researchAreas: c.researchAreas,
              avatarKey: c.avatarKey,
              avatarUrl: c.avatarUrl,
              studyCount,
              followerCount: followerByAuthor.get(c.id) ?? 0,
            },
          ];
        })
        .sort(
          (a, b) =>
            b.followerCount - a.followerCount ||
            b.studyCount - a.studyCount ||
            a.displayName.localeCompare(b.displayName),
        )
        .slice(0, input.limit);
    }),
});

/** Enriched showcase row for the Explore "Researchers to follow" band (EE2). */
type ShowcaseRow = {
  handle: string;
  displayName: string;
  affiliation: string | null;
  researchAreas: string[];
  avatarKey: string | null;
  avatarUrl: string | null;
  studyCount: number;
  followerCount: number;
};
