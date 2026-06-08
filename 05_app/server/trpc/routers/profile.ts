import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { protectedProcedure, router } from "@/server/trpc/trpc";

export type Profile = {
  displayName: string;
  email: string;
  fullName: string | null;
  affiliation: string | null;
  orcid: string | null;
  researchAreas: string[];
  bio: string | null;
  websiteUrl: string | null;
  scholarUrl: string | null;
};

/** ORCID iD: 16 digits in groups of 4, last char may be X (checksum). */
const ORCID_RE = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;

/** Trim a string; empty → null (so optional fields clear cleanly). */
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === "" ? null : s))
    .nullable()
    .optional();

const optUrl = z
  .string()
  .trim()
  .max(300)
  .transform((s) => (s === "" ? null : s))
  .refine((s) => s === null || s === undefined || /^https?:\/\/.+/.test(s), "Enter a valid http(s) URL")
  .nullable()
  .optional();

/**
 * Researcher profile (V1.12 A2, account-settings.md). Fields beyond
 * displayName/theme that researchers want: full name, affiliation, ORCID,
 * research areas, bio, links. Reused by OSF preregistration metadata, the public
 * author byline, and V1.13 Participants. Stored on the local `user` row.
 */
export const profileRouter = router({
  get: protectedProcedure.query(({ ctx }): Profile => {
    const u = ctx.dbUser;
    return {
      displayName: u.displayName,
      email: u.email,
      fullName: u.fullName ?? null,
      affiliation: u.affiliation ?? null,
      orcid: u.orcid ?? null,
      researchAreas: u.researchAreas ?? [],
      bio: u.bio ?? null,
      websiteUrl: u.websiteUrl ?? null,
      scholarUrl: u.scholarUrl ?? null,
    };
  }),

  update: protectedProcedure
    .input(
      z.object({
        displayName: z.string().trim().min(1).max(120).optional(),
        fullName: optText(200),
        affiliation: optText(300),
        orcid: z
          .string()
          .trim()
          .transform((s) => (s === "" ? null : s))
          .refine((s) => s === null || s === undefined || ORCID_RE.test(s), "Use the format XXXX-XXXX-XXXX-XXXX")
          .nullable()
          .optional(),
        researchAreas: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
        bio: optText(2000),
        websiteUrl: optUrl,
        scholarUrl: optUrl,
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      // Only set provided keys (partial update); empty strings already became null.
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const k of [
        "displayName",
        "fullName",
        "affiliation",
        "orcid",
        "researchAreas",
        "bio",
        "websiteUrl",
        "scholarUrl",
      ] as const) {
        if (input[k] !== undefined) patch[k] = input[k];
      }
      await db.update(user).set(patch).where(eq(user.id, ctx.dbUser.id));
      return { ok: true };
    }),
});
