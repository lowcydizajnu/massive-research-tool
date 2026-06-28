"use server";

import { revalidatePath } from "next/cache";

import { getServerApi } from "@/server/trpc/server";

/**
 * Server action wrapping templates.useTemplate (ADR-0063/ADR-0079). The Explore
 * scenario card (client) calls this for `template`-kind CTAs — forking a starter
 * template (e.g. the misinformation starter) into the caller's active workspace.
 * Mirrors createStudyAction: thin entry point, business logic stays in the router.
 */
export async function forkTemplateAction(input: { templateId: string }): Promise<{ id: string }> {
  const api = await getServerApi();
  const result = await api.templates.useTemplate(input);
  revalidatePath("/studies");
  return result;
}
