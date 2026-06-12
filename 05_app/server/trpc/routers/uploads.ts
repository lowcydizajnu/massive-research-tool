import { TRPCError } from "@trpc/server";
import { ulid } from "ulid";
import { z } from "zod";

import { storage } from "@/server/adapters/storage";
import { UPLOAD_KINDS, validateUpload, type UploadKind } from "@/lib/uploads";
import { router, writeProcedure } from "@/server/trpc/trpc";

/**
 * Researcher asset uploads (ADR-0003 amendment): validate type + size, presign
 * a direct-to-R2 PUT (Content-Type is signed), and hand back the stable
 * /api/media URL to store in block config. Workspace-scoped keys.
 */
export const uploadsRouter = router({
  presign: writeProcedure
    .input(
      z.object({
        kind: z.enum(Object.keys(UPLOAD_KINDS) as [UploadKind, ...UploadKind[]]),
        contentType: z.string().max(100),
        sizeBytes: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!storage.configured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "File storage isn’t configured on this server yet.",
        });
      }
      const v = validateUpload(input.kind, input.contentType, input.sizeBytes);
      if (!v.ok) throw new TRPCError({ code: "BAD_REQUEST", message: v.error });
      const key = `ws/${ctx.workspace.id}/${ulid()}.${v.ext}`;
      const uploadUrl = await storage.presignUpload(key, input.contentType);
      return { uploadUrl, key, publicUrl: `/api/media/${key}` };
    }),
});
