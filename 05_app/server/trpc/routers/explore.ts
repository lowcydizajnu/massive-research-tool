import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db/client";
import { experiment, experimentVersion, user, workspaceTemplate } from "@/server/db/schema";
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
   * the public handle + display name (PII-free).
   */
  publicProfiles: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(24).default(8) }).default({ limit: 8 }))
    .query(async ({ input }): Promise<{ handle: string; displayName: string }[]> => {
      const rows = await db
        .select({ handle: user.handle, displayName: user.displayName })
        .from(user)
        .where(
          and(
            eq(user.publicProfileEnabled, true),
            sql`${user.handle} is not null`,
            sql`exists (
              select 1 from ${experiment} e
              where e.owner_id = ${user.id}
                and e.forkable_by = 'public'
                and e.archived_at is null
                and e.is_demo = false
                and exists (select 1 from ${experimentVersion} v where v.experiment_id = e.id and v.kind in ('published','preregistered'))
            )`,
          ),
        )
        .orderBy(sql`${user.displayName} asc`)
        .limit(input.limit);
      return rows.filter((r): r is { handle: string; displayName: string } => r.handle !== null);
    }),
});
