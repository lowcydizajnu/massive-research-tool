/**
 * PostHog implementation of AnalyticsAdapter (ADR-0074). The ONLY file that
 * imports `posthog-node`.
 *
 * - Server-app analytics (NOT per-workspace BYO): the project key is app-level,
 *   read from NEXT_PUBLIC_POSTHOG_KEY (the same phc_ project key the browser
 *   provider uses — it ingests from both client and server) with POSTHOG_API_KEY
 *   as an alias. Absent key ⇒ hard no-op (un-provisioned envs never phone home).
 * - Consent no-op: anything other than "all" returns without capturing.
 * - Sensitivity guard: participant_data / pii (only reachable via an `as any`
 *   cast — they're not in SensitivityTag) THROW, so misuse surfaces loudly
 *   rather than leaking participant data (ADR-0014).
 * - Group analytics: workspace_id is set as a PostHog group so dashboards roll
 *   up per tenant.
 * - Serverless flush: the SDK is configured to flush immediately (flushAt 1) and
 *   each call awaits flush() so events aren't lost when the function freezes.
 */
import { PostHog } from "posthog-node";

import type { AnalyticsAdapter, AnalyticsProperties, SensitivityTag } from "./analytics";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? process.env.POSTHOG_API_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

const FORBIDDEN_SENSITIVITY = new Set(["pii", "participant_data"]);

let client: PostHog | null = null;
function getClient(): PostHog | null {
  if (!KEY) return null;
  if (!client) {
    // flushAt:1 + flushInterval:0 → every event is sent on the next flush(),
    // which each method awaits (serverless functions freeze after the response).
    client = new PostHog(KEY, { host: HOST, flushAt: 1, flushInterval: 0 });
  }
  return client;
}

function assertSafeSensitivity(sensitivity: SensitivityTag): void {
  if (FORBIDDEN_SENSITIVITY.has(sensitivity as string)) {
    throw new Error(
      `analytics: sensitivity "${sensitivity}" must never be tracked — participant/PII data is out of bounds (ADR-0014).`,
    );
  }
}

function groupsFor(workspaceId?: string): { workspace: string } | undefined {
  return workspaceId ? { workspace: workspaceId } : undefined;
}

function withWorkspace(
  properties: AnalyticsProperties | undefined,
  workspaceId: string | undefined,
): AnalyticsProperties | undefined {
  if (!workspaceId) return properties;
  return { ...properties, workspace_id: workspaceId };
}

export const posthogAnalytics: AnalyticsAdapter = {
  async identify({ userId, workspaceId, consent, properties }) {
    if (consent !== "all") return;
    const c = getClient();
    if (!c) return;
    c.identify({ distinctId: userId, properties: withWorkspace(properties, workspaceId) });
    if (workspaceId) c.groupIdentify({ groupType: "workspace", groupKey: workspaceId });
    await c.flush();
  },

  async track({ userId, workspaceId, event, sensitivity, consent, properties }) {
    assertSafeSensitivity(sensitivity); // throws BEFORE the consent gate — misuse is a bug, not a privacy choice
    if (consent !== "all") return;
    const c = getClient();
    if (!c) return;
    c.capture({
      distinctId: userId ?? "anonymous",
      event,
      properties: { ...withWorkspace(properties, workspaceId), sensitivity },
      groups: groupsFor(workspaceId),
    });
    await c.flush();
  },

  async pageView({ userId, workspaceId, pathname, consent }) {
    if (consent !== "all") return;
    const c = getClient();
    if (!c) return;
    c.capture({
      distinctId: userId ?? "anonymous",
      event: "$pageview",
      properties: { $current_url: pathname, ...withWorkspace(undefined, workspaceId) },
      groups: groupsFor(workspaceId),
    });
    await c.flush();
  },
};
