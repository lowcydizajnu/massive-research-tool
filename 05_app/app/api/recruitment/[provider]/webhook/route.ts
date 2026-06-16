import { NextResponse, type NextRequest } from "next/server";

import { jobs } from "@/server/adapters/jobs";
import { getRecruitmentAdapter, type RecruitmentProvider } from "@/server/adapters/recruitment";

/**
 * Recruitment-provider webhook receiver (ADR-0050). Public route — its auth IS
 * the signature check (verified via the adapter, which holds the provider's
 * scheme + secret). Deliberate boundary-only exception (lock-in-inventory.md,
 * Prolific row): like Inngest's serve(), this route imports only the adapter's
 * verify + the job adapter, no business logic.
 *
 * The webhook is advisory: we do NOT trust its body to mutate state. We verify
 * the signature, pull out the affected provider study id, and enqueue a job that
 * RE-FETCHES that study through the adapter (idempotent). A missed/duplicate/late
 * ping is harmless — the 10-minute polling sweep is the correctness backstop.
 *
 * NOTE: the exact signature header + scheme is provider-specific and must be
 * confirmed against Prolific's webhook docs at registration (ADR-0050 open item).
 * If it isn't HMAC-SHA256-over-raw-body, only the adapter's verify changes.
 */
const PROVIDERS = new Set<RecruitmentProvider>(["prolific"]);

const SIGNATURE_HEADERS = ["x-prolific-signature", "prolific-signature", "x-hub-signature-256", "x-webhook-signature"];

/** Pull the affected provider study id out of a (provider-specific) webhook body, liberally. */
function extractStudyId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const data = (p.data ?? {}) as Record<string, unknown>;
  const study = (p.study ?? data.study ?? {}) as Record<string, unknown>;
  const candidate =
    p.study_id ?? p.resource_id ?? data.study_id ?? data.resource_id ?? study.id ?? data.id;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  if (!PROVIDERS.has(provider as RecruitmentProvider)) {
    return NextResponse.json({ error: "Unknown provider." }, { status: 404 });
  }
  const recruitmentProvider = provider as RecruitmentProvider;

  // Read the raw body BEFORE parsing — signature is computed over the exact bytes.
  const rawBody = await req.text();
  const signature =
    SIGNATURE_HEADERS.map((h) => req.headers.get(h))
      .find((v): v is string => !!v)
      ?.replace(/^sha256=/i, "") ?? "";

  if (!getRecruitmentAdapter(recruitmentProvider).verifyWebhookSignature({ rawBody, signature })) {
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
    // Verified, but nothing to reconcile (e.g. a ping/test event) — ack so the
    // provider doesn't retry.
    return NextResponse.json({ ok: true, reconciling: false });
  }

  // Enqueue the idempotent reconcile; ack immediately so the provider sees 200.
  await jobs.enqueue("recruitment.reconcile-study", { provider: recruitmentProvider, providerStudyId });
  return NextResponse.json({ ok: true, reconciling: true });
}
