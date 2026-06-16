import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";

import { jobs } from "@/server/adapters/jobs";
import { getRecruitmentAdapter, type RecruitmentProvider } from "@/server/adapters/recruitment";
import { decryptSecret } from "@/server/crypto/tokens";
import { db } from "@/server/db/client";
import { recruitmentProviderWebhook } from "@/server/db/schema";

/**
 * Recruitment-provider webhook receiver (ADR-0050). Public route — its auth IS
 * the signature check. The URL carries the workspace id so we can load THAT
 * workspace's per-workspace signing secret (Prolific issues one per workspace
 * via /hooks/secrets/) BEFORE trusting any of the request body.
 *
 * Boundary-only exception (lock-in-inventory.md, Prolific row): imports only the
 * adapter's verify + the job adapter. The webhook is advisory — we never trust
 * its body to mutate state; we enqueue an idempotent reconcile that RE-FETCHES
 * through the adapter. Missed/duplicate/late pings are harmless; the 10-minute
 * polling sweep is the correctness backstop.
 */
const PROVIDERS = new Set<RecruitmentProvider>(["prolific"]);

/** Pull the affected provider study id out of a (provider-specific) webhook body, liberally. */
function extractStudyId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const data = (p.data ?? {}) as Record<string, unknown>;
  const study = (p.study ?? data.study ?? {}) as Record<string, unknown>;
  const candidate = p.study_id ?? p.resource_id ?? data.study_id ?? data.resource_id ?? study.id ?? data.id;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string; workspaceId: string }> }) {
  const { provider, workspaceId } = await ctx.params;
  if (!PROVIDERS.has(provider as RecruitmentProvider)) {
    return NextResponse.json({ error: "Unknown provider." }, { status: 404 });
  }
  const recruitmentProvider = provider as RecruitmentProvider;

  // Look up THIS workspace's signing secret (set when the webhook was enabled).
  const [row] = await db
    .select({ signingSecret: recruitmentProviderWebhook.signingSecret })
    .from(recruitmentProviderWebhook)
    .where(
      and(
        eq(recruitmentProviderWebhook.workspaceId, workspaceId),
        eq(recruitmentProviderWebhook.provider, recruitmentProvider),
      ),
    )
    .limit(1);
  if (!row) return NextResponse.json({ error: "No webhook configured." }, { status: 404 });

  // Verify over the EXACT bytes received (timestamp + rawBody), per ADR-0050.
  const rawBody = await req.text();
  const signature = req.headers.get("x-prolific-request-signature") ?? "";
  const timestamp = req.headers.get("x-prolific-request-timestamp") ?? "";
  const secret = decryptSecret(row.signingSecret);
  if (!getRecruitmentAdapter(recruitmentProvider).verifyWebhookSignature({ rawBody, timestamp, signature, secret })) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Bad payload." }, { status: 400 });
  }

  const providerStudyId = extractStudyId(payload);
  if (!providerStudyId) {
    // Verified, but no study to reconcile (e.g. a ping/test event) — ack so the provider doesn't retry.
    return NextResponse.json({ ok: true, reconciling: false });
  }

  await jobs.enqueue("recruitment.reconcile-study", { provider: recruitmentProvider, providerStudyId });
  return NextResponse.json({ ok: true, reconciling: true });
}
