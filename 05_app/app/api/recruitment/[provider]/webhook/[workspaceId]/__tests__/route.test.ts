/**
 * Recruitment webhook receiver (ADR-0050). The URL carries the workspace id; the
 * route loads THAT workspace's stored signing secret, verifies via the adapter,
 * then enqueues an idempotent reconcile. Over a real migrated PGlite DB; the job
 * adapter + the adapter's verify are mocked (the real HMAC scheme is unit-tested
 * in recruitment.prolific.test.ts). The verify spy is asserted to receive the
 * raw body + the decrypted per-workspace secret.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/server/db/client", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const schema = await import("@/server/db/schema");
  const pg = new PGlite();
  const db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: "./server/db/migrations" });
  return { db, schema };
});

const { enqueue, verifyWebhookSignature } = vi.hoisted(() => ({
  enqueue: vi.fn().mockResolvedValue(undefined),
  verifyWebhookSignature: vi.fn(),
}));
vi.mock("@/server/adapters/jobs", () => ({ jobs: { enqueue } }));
// Mock getRecruitmentAdapter directly (NOT via importing the real prolific
// adapter — that module imports ./recruitment, a circular import that deadlocks
// vitest's module graph). The real verify scheme is covered in the adapter test.
vi.mock("@/server/adapters/recruitment", async (orig) => {
  const actual = await orig<typeof import("@/server/adapters/recruitment")>();
  return { ...actual, getRecruitmentAdapter: () => ({ verifyWebhookSignature }) };
});

import { ulid } from "ulid";

import { encryptSecret } from "@/server/crypto/tokens";
import { db } from "@/server/db/client";
import { recruitmentProviderWebhook, user, workspace } from "@/server/db/schema";
import { POST } from "@/app/api/recruitment/[provider]/webhook/[workspaceId]/route";

const SECRET = "ws-signing-secret";

function req(body: string, headers: Record<string, string> = {}): NextRequest {
  return { text: async () => body, headers: new Headers(headers) } as unknown as NextRequest;
}
const params = (provider: string, workspaceId: string) => ({ params: Promise.resolve({ provider, workspaceId }) });

let wsId: string;

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(recruitmentProviderWebhook);
  await db.delete(workspace);
  await db.delete(user);
  const [u] = await db.insert(user).values({ externalId: "u", email: "u@e.com", displayName: "u" }).returning();
  const [ws] = await db.insert(workspace).values({ name: "Lab", slug: "lab", ownerId: u.id }).returning();
  wsId = ws.id;
  await db.insert(recruitmentProviderWebhook).values({
    id: ulid(),
    workspaceId: ws.id,
    provider: "prolific",
    signingSecret: encryptSecret(SECRET),
    subscriptions: [{ id: "sub1", eventType: "study.status.change" }],
    createdByUserId: u.id,
    confirmedAt: new Date(),
  });
});

describe("POST /api/recruitment/[provider]/webhook/[workspaceId]", () => {
  it("404s an unknown provider", async () => {
    const res = await POST(req("{}"), params("mturk", wsId));
    expect(res.status).toBe(404);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("404s when the workspace has no webhook configured", async () => {
    verifyWebhookSignature.mockReturnValue(true);
    const res = await POST(req("{}", { "x-prolific-request-signature": "x", "x-prolific-request-timestamp": "1" }), params("prolific", "00000000-0000-4000-8000-000000000000"));
    expect(res.status).toBe(404);
    expect(verifyWebhookSignature).not.toHaveBeenCalled(); // bail before verify when no secret row
  });

  it("verifies with the decrypted per-workspace secret over the raw body, then enqueues", async () => {
    verifyWebhookSignature.mockReturnValue(true);
    const ts = "1718524800";
    const body = JSON.stringify({ event_type: "study.status.change", study_id: "STUDY-7" });
    const res = await POST(
      req(body, { "x-prolific-request-signature": "sig", "x-prolific-request-timestamp": ts }),
      params("prolific", wsId),
    );
    expect(res.status).toBe(200);
    // The route decrypts THIS workspace's secret and verifies over the exact bytes + timestamp.
    expect(verifyWebhookSignature).toHaveBeenCalledWith({ rawBody: body, timestamp: ts, signature: "sig", secret: SECRET });
    expect(enqueue).toHaveBeenCalledWith("recruitment.reconcile-study", { provider: "prolific", providerStudyId: "STUDY-7" });
  });

  it("401s when verification fails (no enqueue)", async () => {
    verifyWebhookSignature.mockReturnValue(false);
    const res = await POST(
      req(JSON.stringify({ study_id: "s1" }), { "x-prolific-request-signature": "wrong", "x-prolific-request-timestamp": "1" }),
      params("prolific", wsId),
    );
    expect(res.status).toBe(401);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("acks a verified ping with no study id without enqueuing", async () => {
    verifyWebhookSignature.mockReturnValue(true);
    const res = await POST(
      req(JSON.stringify({ event_type: "ping" }), { "x-prolific-request-signature": "sig", "x-prolific-request-timestamp": "1" }),
      params("prolific", wsId),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, reconciling: false });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("400s a verified request whose body isn't valid JSON", async () => {
    verifyWebhookSignature.mockReturnValue(true);
    const res = await POST(
      req("not json{", { "x-prolific-request-signature": "sig", "x-prolific-request-timestamp": "1" }),
      params("prolific", wsId),
    );
    expect(res.status).toBe(400);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
