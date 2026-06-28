import { eq, or, type SQL } from "drizzle-orm";

import { experiment, workspace } from "@/server/db/schema";

/**
 * Shared "honest demo toggle" conditions (ADR-0023). Seeded demo content
 * (experiment.is_demo) is HIDDEN, never deleted; a workspace's
 * `show_demo_content` flag decides whether its own demo studies surface in that
 * workspace's researcher-facing lists/counts. These helpers keep the call sites
 * declarative — drop the result into an `and(...)` and it either narrows the
 * query or is a no-op (`undefined`).
 */

/**
 * Workspace-scoped surfaces (the active workspace already bounds the query):
 * include demo studies only when this workspace opted in. Returns `undefined`
 * (no filter) when demo content is shown, so it composes cleanly inside `and()`.
 */
export function demoStudyCondition(showDemoContent: boolean): SQL | undefined {
  return showDemoContent ? undefined : eq(experiment.isDemo, false);
}

/**
 * Cross-workspace personal surfaces (me.*) span every workspace the caller
 * authored in, so the toggle is PER OWNING WORKSPACE: keep a demo study only if
 * it isn't demo, OR its own workspace has show_demo_content on. Requires a join
 * to `workspace` on `experiment.tenantId = workspace.id`. Always returns a
 * condition (never a no-op) — there is no single flag to short-circuit on.
 */
export function crossWorkspaceDemoStudyCondition(): SQL {
  // `or(...)` with two concrete clauses is always defined.
  return or(eq(experiment.isDemo, false), eq(workspace.showDemoContent, true))!;
}
