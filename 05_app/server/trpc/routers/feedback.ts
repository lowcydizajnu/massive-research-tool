import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";

import { trackEvent } from "@/server/analytics/track";
import { db } from "@/server/db/client";
import { experiment, feedback, user, workspace } from "@/server/db/schema";
import { storage } from "@/server/adapters/storage";
import { consentRequestContext } from "@/server/legal/consent";
import { resolveActiveWorkspace } from "@/server/workspace/active";
import {
  FEEDBACK_BODY_MAX,
  FEEDBACK_KINDS,
  FEEDBACK_STATUSES,
  feedbackScreenshotKey,
  type FeedbackStatus,
} from "@/lib/feedback";
import { adminProcedure, protectedProcedure, router } from "@/server/trpc/trpc";

/**
 * In-app product feedback (platform-foundation PF2, ADR-0072).
 *
 * `submit` writes the row (protected — works on personal pages too, so the
 * workspace is resolved server-side and may be null) and, when a screenshot was
 * requested, returns a short-lived signed R2 PUT URL plus the deterministic key.
 * `confirmScreenshot` records the key AFTER the client upload completes
 * (decouples the DB write from the R2 upload). The key is recomputed
 * server-side, never trusted from the client. PII discipline (ADR-0014): the
 * one-way UA hash + coarse country come from the request context, never raw.
 */
export const feedbackRouter = router({
  submit: protectedProcedure
    .input(
      z.object({
        kind: z.enum(FEEDBACK_KINDS),
        body: z.string().trim().min(1).max(FEEDBACK_BODY_MAX),
        url: z.string().max(2000).optional(),
        routeName: z.string().max(300).optional(),
        studyId: z.string().uuid().optional(),
        includeScreenshot: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Resolve the workspace server-side — don't trust a client-supplied id for
      // the R2 key / FK. Personal pages have none; that's fine (nullable column).
      const active = await resolveActiveWorkspace(ctx.dbUser.id, ctx.preferredWorkspaceId);
      const workspaceId = active?.workspace.id ?? null;

      // Only tag a study the user can actually see in this workspace.
      let studyId: string | null = null;
      if (input.studyId && workspaceId) {
        const [study] = await db
          .select({ id: experiment.id })
          .from(experiment)
          .where(and(eq(experiment.id, input.studyId), eq(experiment.tenantId, workspaceId)))
          .limit(1);
        studyId = study?.id ?? null;
      }

      const { userAgentHash, ipCountry } = await consentRequestContext();
      const id = ulid();

      await db.insert(feedback).values({
        id,
        workspaceId,
        userId: ctx.dbUser.id,
        kind: input.kind,
        body: input.body,
        url: input.url ?? null,
        routeName: input.routeName ?? null,
        userAgentHash,
        ipCountry,
        studyId,
      });

      await trackEvent({
        userId: ctx.dbUser.id,
        workspaceId: workspaceId ?? undefined,
        event: "feedback_submitted",
        sensitivity: "researcher_behavior",
        properties: { kind: input.kind },
      });

      if (input.includeScreenshot && storage.configured()) {
        const key = feedbackScreenshotKey(workspaceId, id);
        const uploadUrl = await storage.presignUpload(key, "image/png");
        return { feedbackId: id, screenshotUploadUrl: uploadUrl, r2Key: key };
      }
      return { feedbackId: id, screenshotUploadUrl: null, r2Key: null };
    }),

  confirmScreenshot: protectedProcedure
    .input(z.object({ feedbackId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .select({ id: feedback.id, workspaceId: feedback.workspaceId, userId: feedback.userId })
        .from(feedback)
        .where(eq(feedback.id, input.feedbackId))
        .limit(1);
      // Only the author may confirm their own screenshot.
      if (!row || row.userId !== ctx.dbUser.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      // Recompute the key server-side — never trust a client-supplied path.
      const key = feedbackScreenshotKey(row.workspaceId, row.id);
      await db.update(feedback).set({ screenshotR2Key: key }).where(eq(feedback.id, row.id));
      return { ok: true as const };
    }),

  // --- Admin queue (owner-only via ADMIN_USER_IDS allow-list; the full
  // user.is_admin gate lands with the Analytics + Admin handoff). ---
  adminList: adminProcedure
    .input(
      z
        .object({ status: z.enum(FEEDBACK_STATUSES).optional(), limit: z.number().int().min(1).max(200).default(100) })
        .default({ limit: 100 }),
    )
    .query(async ({ input }) => {
      const rows = await db
        .select({
          id: feedback.id,
          kind: feedback.kind,
          body: feedback.body,
          url: feedback.url,
          routeName: feedback.routeName,
          ipCountry: feedback.ipCountry,
          status: feedback.status,
          screenshotR2Key: feedback.screenshotR2Key,
          createdAt: feedback.createdAt,
          submitterName: user.displayName,
          submitterEmail: user.email,
          workspaceName: workspace.name,
        })
        .from(feedback)
        .leftJoin(user, eq(feedback.userId, user.id))
        .leftJoin(workspace, eq(feedback.workspaceId, workspace.id))
        .where(input.status ? eq(feedback.status, input.status) : undefined)
        .orderBy(desc(feedback.createdAt))
        .limit(input.limit);

      // Presign a short-lived download for each screenshot so the admin can view
      // it without making the bucket public.
      const configured = storage.configured();
      return Promise.all(
        rows.map(async (r) => ({
          ...r,
          status: r.status as FeedbackStatus,
          screenshotUrl:
            r.screenshotR2Key && configured
              ? await storage.presignDownload(r.screenshotR2Key, 600, "inline")
              : null,
        })),
      );
    }),
});
