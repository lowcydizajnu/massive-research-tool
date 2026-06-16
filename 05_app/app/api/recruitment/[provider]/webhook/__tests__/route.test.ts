/**
 * Recruitment webhook receiver (ADR-0050). Signature is the auth; a verified
 * ping enqueues an idempotent reconcile and never mutates state itself. The job
 * adapter + provider adapter are mocked so we assert routing, not side effects.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { enqueue, verifyWebhookSignature } = vi.hoisted(() => ({
  enqueue: vi.fn().mockResolvedValue(undefined),
  verifyWebhookSignature: vi.fn(),
}));
vi.mock("@/server/adapters/jobs", () => ({ jobs: { enqueue } }));
vi.mock("@/server/adapters/recruitment", async (orig) => {
  const actual = await orig<typeof import("@/server/adapters/recruitment")>();
  return { ...actual, getRecruitmentAdapter: vi.fn(() => ({ verifyWebhookSignature })) };
});

import { POST } from "@/app/api/recruitment/[provider]/webhook/route";

function req(body: string, headers: Record<string, string> = {}): NextRequest {
  const h = new Headers(headers);
  return { text: async () => body, headers: h } as unknown as NextRequest;
}
const params = (provider: string) => ({ params: Promise.resolve({ provider }) });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/recruitment/[provider]/webhook", () => {
  it("404s an unknown provider before any work", async () => {
    const res = await POST(req("{}"), params("mturk"));
    expect(res.status).toBe(404);
    expect(verifyWebhookSignature).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("401s when the signature does not verify (no enqueue)", async () => {
    verifyWebhookSignature.mockReturnValue(false);
    const res = await POST(req(JSON.stringify({ study_id: "s1" }), { "x-prolific-signature": "bad" }), params("prolific"));
    expect(res.status).toBe(401);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("verifies over the RAW body and enqueues a reconcile for the affected study", async () => {
    verifyWebhookSignature.mockReturnValue(true);
    const raw = JSON.stringify({ event_type: "submission.completed", study_id: "STUDY-9" });
    const res = await POST(req(raw, { "x-prolific-signature": "sha256=good" }), params("prolific"));
    expect(res.status).toBe(200);
    // signature checked against the exact bytes, with the sha256= prefix stripped.
    expect(verifyWebhookSignature).toHaveBeenCalledWith({ rawBody: raw, signature: "good" });
    expect(enqueue).toHaveBeenCalledWith("recruitment.reconcile-study", { provider: "prolific", providerStudyId: "STUDY-9" });
  });

  it("acks a verified ping with no study id without enqueuing (e.g. a test event)", async () => {
    verifyWebhookSignature.mockReturnValue(true);
    const res = await POST(req(JSON.stringify({ event_type: "ping" }), { "x-prolific-signature": "ok" }), params("prolific"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, reconciling: false });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("400s a verified request whose body isn't valid JSON", async () => {
    verifyWebhookSignature.mockReturnValue(true);
    const res = await POST(req("not json{", { "x-prolific-signature": "ok" }), params("prolific"));
    expect(res.status).toBe(400);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
