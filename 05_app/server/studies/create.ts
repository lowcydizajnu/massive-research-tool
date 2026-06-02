"use server";

import { revalidatePath } from "next/cache";

import { getServerApi } from "@/server/trpc/server";

/**
 * Server action wrapping the studies.create tRPC mutation. The New study modal
 * (client) calls this directly, so we don't yet need the tRPC HTTP client +
 * React Query — that lands when a surface needs client-side queries /
 * optimistic updates. Business logic stays in the tRPC router (single API
 * surface); this is the thin client entry point.
 */
export async function createStudyAction(input: {
  kind: "blank";
  title?: string;
}): Promise<{ id: string }> {
  const api = await getServerApi();
  const result = await api.studies.create(input);
  // Refresh the Studies list RSC so the new draft shows on return.
  revalidatePath("/studies");
  return result;
}
