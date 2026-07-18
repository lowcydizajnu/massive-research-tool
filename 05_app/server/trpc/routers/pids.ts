import { z } from "zod";

import { searchFunders, searchRor, type FunderHit, type RorHit } from "@/server/modules/pid-registries";
import { protectedProcedure, router } from "@/server/trpc/trpc";

/**
 * Type-ahead against the public PID registries (ADR-0108, LOS item ⑩): ROR
 * (institutions) and the Crossref Funder Registry. Authed-only so our proxy
 * isn't an open relay; the lookup itself degrades to `[]` on any failure so the
 * UI never blocks (the researcher can always fall back to free text).
 */
export const pidsRouter = router({
  searchRor: protectedProcedure
    .input(z.object({ query: z.string().max(120) }))
    .query(async ({ input }): Promise<RorHit[]> => searchRor(input.query)),

  searchFunders: protectedProcedure
    .input(z.object({ query: z.string().max(120) }))
    .query(async ({ input }): Promise<FunderHit[]> => searchFunders(input.query)),
});
