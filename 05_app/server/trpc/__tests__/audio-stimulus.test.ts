import { beforeEach, describe, expect, it, vi } from "vitest";

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

// One shared adapter backs `ai`, providerAdapter() — its synthesizeAudio is the TTS spy.
vi.mock("@/server/adapters/ai", () => {
  const adapter = {
    validateKey: vi.fn(async () => true),
    ping: vi.fn(async () => ({})),
    chat: vi.fn(),
    synthesizeAudio: vi.fn(async () => ({ audioBase64: "QUJD", mimeType: "audio/mpeg", durationMs: 2000, charsBilled: 40 })),
  };
  return { ai: adapter, AI_PROVIDERS: ["anthropic", "hume"], providerAdapter: () => adapter };
});

// Storage: presign returns dummy URLs; the actual HEAD/PUT go through global fetch (mocked below).
vi.mock("@/server/adapters/storage", () => ({
  storage: {
    presignUpload: vi.fn(async (key: string) => `https://r2.test/put/${key}`),
    presignDownload: vi.fn(async (key: string) => `https://r2.test/get/${key}`),
  },
}));

import { eq } from "drizzle-orm";

import type { AuthUser } from "@/server/adapters/auth";
import { providerAdapter } from "@/server/adapters/ai";
import { encryptSecret } from "@/server/crypto/tokens";
import { db } from "@/server/db/client";
import { aiInvocation, aiProviderConnection, member, user, workspace } from "@/server/db/schema";
import { appRouter } from "@/server/trpc/root";
import { createCallerFactory } from "@/server/trpc/trpc";

const createCaller = createCallerFactory(appRouter);
const synth = vi.mocked(providerAdapter("hume").synthesizeAudio!);
const authUser = (ext: string): AuthUser => ({ id: ext, email: `${ext}@e.com`, displayName: ext, avatarUrl: null, hasCompletedOnboarding: true });

let fetchMock: ReturnType<typeof vi.fn>;

// The mocked PGlite db is shared across this file's tests — unique natural keys per seed.
let seq = 0;
async function seed(connectHume: boolean) {
  const n = ++seq;
  const ext = `hanna${n}`;
  const [u] = await db.insert(user).values({ externalId: ext, email: `${ext}@e.com`, displayName: ext }).returning();
  const [ws] = await db.insert(workspace).values({ name: `Lab ${n}`, slug: `lab-${n}`, ownerId: u.id }).returning();
  await db.insert(member).values({ workspaceId: ws.id, userId: u.id, role: "owner", status: "active" });
  if (connectHume) {
    await db.insert(aiProviderConnection).values({
      id: `conn${n}`,
      workspaceId: ws.id,
      userId: u.id,
      provider: "hume",
      apiKey: encryptSecret("hume-key"),
      keyHint: "key",
      status: "active",
    });
  }
  const caller = createCaller({ authUser: authUser(ext) });
  const { id: studyId } = await caller.studies.create({ kind: "blank", title: "Audio study" });
  const { instanceId } = await caller.studies.addBlock({ studyId, source: "core", key: "audio-stimulus", version: "1.0.0" });
  await caller.studies.updateBlockConfig({
    studyId,
    instanceId,
    config: { script: "Coffee reverses aging, a study claims.", description: "urgent newsreader", playback: "replayable", audioUrl: "", audioHash: "" },
  });
  return { caller, studyId, instanceId, workspaceId: ws.id };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  // Default: cache miss (HEAD 404), PUT ok.
  fetchMock = vi.fn(async (_url: string, opts?: { method?: string }) =>
    opts?.method === "HEAD" ? ({ ok: false } as Response) : ({ ok: true } as Response),
  );
  vi.stubGlobal("fetch", fetchMock);
});

describe("studies.generateStimulusAudio (ADR-0069)", () => {
  it("cache miss: generates via TTS, stores to R2, writes the URL onto the block, audits", async () => {
    const { caller, studyId, instanceId, workspaceId } = await seed(true);
    const res = await caller.studies.generateStimulusAudio({ studyId, instanceId });

    expect(res.cached).toBe(false);
    expect(res.url).toContain(`/api/media/ws/${workspaceId}/audio-stimulus/`);
    expect(synth).toHaveBeenCalledOnce();
    // A PUT actually stored the bytes.
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/put/"), expect.objectContaining({ method: "PUT" }));
    // The URL is persisted on the block config.
    const study = await caller.studies.get({ id: studyId });
    const block = study.blocks.find((b) => b.instanceId === instanceId)!;
    expect((block.config as { audioUrl: string }).audioUrl).toBe(res.url);
    // One tts invocation audited.
    const rows = await db.select().from(aiInvocation).where(eq(aiInvocation.workspaceId, workspaceId));
    expect(rows).toHaveLength(1);
    expect(rows[0].modality).toBe("tts");
  });

  it("cache hit: skips TTS when the clip already exists in R2", async () => {
    const { caller, studyId, instanceId } = await seed(true);
    fetchMock.mockImplementation(async () => ({ ok: true }) as Response); // HEAD 200 → hit
    const res = await caller.studies.generateStimulusAudio({ studyId, instanceId });
    expect(res.cached).toBe(true);
    expect(synth).not.toHaveBeenCalled();
  });

  it("rejects when no Hume connection", async () => {
    const { caller, studyId, instanceId } = await seed(false);
    await expect(caller.studies.generateStimulusAudio({ studyId, instanceId })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(synth).not.toHaveBeenCalled();
  });
});
