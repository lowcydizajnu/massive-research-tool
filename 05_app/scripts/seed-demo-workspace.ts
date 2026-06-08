/**
 * Dev seeder — populates your workspace with realistic, curated DEMO studies
 * (V1.12 A3, ADR-0023) so the tool looks alive on first run: a misinformation
 * classic, an NPS pulse, a conjoint/MaxDiff pilot, a longitudinal mood study, a
 * cross-author replication, an archived underpowered pilot, and a WIP draft —
 * each with real blocks, fake responses, a couple of comments, and a fork.
 *
 * Every study is flagged `is_demo` (never publicly discoverable) and the
 * workspace's `show_demo_content` is switched on. Idempotent: re-runs skip if
 * demo studies already exist.
 *
 * Run:  cd 05_app && npx tsx scripts/seed-demo-workspace.ts [your-email]
 * NOT imported by the app; never bundled.
 */
import { config } from "dotenv";

export const DEFAULT_EMAIL = "lowcydizajnu@gmail.com";

// Deterministic-ish randomness is unnecessary for a seed; plain Math.random is fine here.
const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const pick = <T>(arr: T[]): T => arr[randInt(0, arr.length - 1)];

/**
 * Seed the curated demo studies into the workspace owned by `email`. The DB
 * client (lazy) reads DATABASE_URL on first use, so callers set it first
 * (dev = .env.local; prod = seed-demo-prod.ts derives it via the Neon API).
 * Idempotent: returns early if demo studies already exist. Throws on error.
 */
export async function seedDemoWorkspace(email: string): Promise<void> {
  const { and, eq } = await import("drizzle-orm");
  const { ulid } = await import("ulid");
  const { db } = await import("@/server/db/client");
  const s = await import("@/server/db/schema");
  const { getModuleDef, locksFromBlocks } = await import("@/server/modules/registry").then(
    async (reg) => ({ getModuleDef: reg.getModuleDef, locksFromBlocks: (await import("@/server/modules/blocks")).locksFromBlocks }),
  );

  type Block = { instanceId: string; source: string; key: string; version: string; config: Record<string, unknown> };
  const blk = (key: string, cfg: Record<string, unknown>, version = "1.0.0"): Block => ({
    instanceId: ulid(),
    source: "core",
    key,
    version,
    config: cfg,
  });

  const FREE_TEXT = [
    "It looked professionally made, so I assumed it was real.",
    "The source seemed unreliable to me.",
    "I wasn't sure — the headline was emotionally charged.",
    "I'd want to check another outlet before sharing.",
    "Hard to say without more context.",
  ];

  function genAnswer(b: Block): Record<string, unknown> | null {
    const def = getModuleDef(b.source, b.key, b.version);
    if (!def || !def.collectsResponse) return null;
    const c = b.config;
    switch (b.key) {
      case "likert-7":
        return { value: randInt(1, 7) };
      case "nps":
        return { value: randInt(0, 10) };
      case "rating-stars":
        return { value: randInt(1, typeof c.max === "number" ? c.max : 5) };
      case "slider":
      case "vas": {
        const min = typeof c.min === "number" ? c.min : 0;
        const max = typeof c.max === "number" ? c.max : 100;
        return { value: randInt(min, max) };
      }
      case "number":
        return { value: randInt(18, 75) };
      case "reaction-time":
        return { value: randInt(240, 620) };
      case "multiple-choice": {
        const opts = Array.isArray(c.options) ? (c.options as string[]) : [];
        return { selected: opts.length ? [pick(opts)] : [] };
      }
      case "dropdown":
      case "yes-no": {
        if (b.key === "yes-no") return { value: pick(["yes", "no"]) };
        const opts = Array.isArray(c.options) ? (c.options as string[]) : [];
        return { value: opts.length ? pick(opts) : "" };
      }
      case "free-text":
        return { text: pick(FREE_TEXT) };
      case "email":
        return { value: `p${randInt(1000, 9999)}@example.com` };
      case "matrix-grid": {
        const rows = Array.isArray(c.rows) ? (c.rows as string[]) : [];
        const cols = Array.isArray(c.columns) ? (c.columns as string[]) : [];
        const values: Record<string, string> = {};
        rows.forEach((_, i) => (values[String(i)] = pick(cols)));
        return { values };
      }
      case "semantic-differential": {
        const left = Array.isArray(c.leftLabels) ? (c.leftLabels as string[]) : [];
        const points = typeof c.points === "number" ? c.points : 7;
        const values: Record<string, number> = {};
        left.forEach((_, i) => (values[String(i)] = randInt(1, points)));
        return { values };
      }
      case "maxdiff": {
        const items = Array.isArray(c.items) ? (c.items as string[]) : [];
        if (items.length < 2) return { best: "", worst: "" };
        const best = pick(items);
        let worst = pick(items);
        while (worst === best) worst = pick(items);
        return { best, worst };
      }
      default:
        return { value: randInt(1, 5) };
    }
  }

  // ---- resolve owner + workspace ----
  const [owner] = await db.select().from(s.user).where(eq(s.user.email, email)).limit(1);
  if (!owner) throw new Error(`No user with email ${email}.`);
  const [ws] = await db.select().from(s.workspace).where(eq(s.workspace.ownerId, owner.id)).limit(1);
  if (!ws) throw new Error(`No workspace owned by ${email}.`);

  // Idempotency: bail if demo studies already exist.
  const existing = await db
    .select({ id: s.experiment.id })
    .from(s.experiment)
    .where(and(eq(s.experiment.tenantId, ws.id), eq(s.experiment.isDemo, true)))
    .limit(1);
  if (existing.length) {
    console.log("Demo studies already seeded — nothing to do.");
    return;
  }

  // Teammates for authorship / replication.
  async function ensureTeammate(ext: string, displayName: string): Promise<string> {
    let [u] = await db.select().from(s.user).where(eq(s.user.externalId, ext)).limit(1);
    if (!u) {
      [u] = await db
        .insert(s.user)
        .values({ externalId: ext, email: `${ext}@example.com`, displayName })
        .returning();
    }
    const [m] = await db
      .select()
      .from(s.member)
      .where(and(eq(s.member.workspaceId, ws.id), eq(s.member.userId, u.id)))
      .limit(1);
    if (!m) {
      await db.insert(s.member).values({ workspaceId: ws.id, userId: u.id, role: "editor", status: "active" });
    }
    return u.id;
  }
  const sofiaId = await ensureTeammate("demo-sofia", "Sofia Almeida");
  const mayaId = await ensureTeammate("demo-maya", "Maya Chen");

  type Stage = "draft" | "preregistered" | "published";
  const kindOf: Record<Stage, "autosave" | "preregistered" | "published"> = {
    draft: "autosave",
    preregistered: "preregistered",
    published: "published",
  };

  async function buildStudy(opts: {
    title: string;
    ownerId?: string;
    tags: string[];
    blocks: Block[];
    stage: Stage;
    responses: number;
    archived?: boolean;
    forkOf?: { experimentId: string; versionId: string };
  }): Promise<{ experimentId: string; versionId: string }> {
    const experimentId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    await db.insert(s.experiment).values({
      id: experimentId,
      tenantId: ws.id,
      ownerId: opts.ownerId ?? owner.id,
      title: opts.title,
      tags: opts.tags,
      forkableBy: "public",
      isDemo: true,
      archivedAt: opts.archived ? new Date() : null,
      forkOfExperimentId: opts.forkOf?.experimentId ?? null,
      forkOfVersionId: opts.forkOf?.versionId ?? null,
    });
    await db.insert(s.experimentVersion).values({
      id: versionId,
      experimentId,
      createdBy: opts.ownerId ?? owner.id,
      versionNumber: opts.stage === "draft" ? 0 : 1,
      kind: kindOf[opts.stage],
      name: opts.stage === "draft" ? null : "v1",
      definitionSnapshot: { blocks: opts.blocks },
      moduleVersionLocks: locksFromBlocks(opts.blocks as never),
    });
    await db.update(s.experiment).set({ currentVersionId: versionId }).where(eq(s.experiment.id, experimentId));

    if (opts.responses > 0) {
      const recId = ulid();
      await db.insert(s.recruitmentSession).values({ id: recId, experimentVersionId: versionId, status: "open" });
      const condId = ulid();
      await db.insert(s.condition).values({ id: condId, experimentVersionId: versionId, slug: "control", name: "Control", position: 0 });
      for (let i = 0; i < opts.responses; i++) {
        const rId = ulid();
        await db.insert(s.response).values({
          id: rId,
          recruitmentSessionId: recId,
          experimentVersionId: versionId,
          conditionId: condId,
          mode: "run",
          status: "completed",
          completedAt: new Date(),
        });
        for (let p = 0; p < opts.blocks.length; p++) {
          const b = opts.blocks[p];
          const ans = genAnswer(b);
          if (!ans) continue;
          await db.insert(s.responseItem).values({
            id: ulid(),
            responseId: rId,
            blockInstanceId: b.instanceId,
            blockPosition: p,
            moduleSource: b.source,
            moduleKey: b.key,
            moduleVersion: b.version,
            answer: ans,
          });
        }
      }
      await db.update(s.recruitmentSession).set({ currentN: opts.responses }).where(eq(s.recruitmentSession.id, recId));
    }
    console.log(`  · ${opts.title} (${opts.stage}${opts.archived ? ", archived" : ""}, ${opts.responses} responses)`);
    return { experimentId, versionId };
  }

  console.log(`Seeding demo studies into "${ws.name}"…`);

  // 1) Misinformation classic (published).
  const misBlocks = [
    blk("text", { contentMd: "You'll see a social media post. Answer honestly — there are no right answers." }),
    blk("social-post", { headline: "Scientists confirm coffee reverses aging, study claims", body: "A viral post citing an unnamed 'leading institute'.", source: "@health_buzz", imageUrl: "", shareCountVisible: true }, "2.0.0"),
    blk("likert-7", { prompt: "How credible is this post?", leftAnchor: "Not at all", rightAnchor: "Extremely", required: true }),
    blk("multiple-choice", { prompt: "Would you share this?", options: ["Definitely not", "Probably not", "Maybe", "Probably", "Definitely"], multiple: false, randomizeOrder: false, required: true }),
    blk("free-text", { prompt: "Why or why not?", longForm: true, required: false, maxLength: 500 }),
  ];
  const mis = await buildStudy({
    title: "Do warning labels reduce belief in false headlines?",
    tags: ["misinformation", "credibility"],
    blocks: misBlocks,
    stage: "published",
    responses: 124,
  });

  // 2) NPS pulse (published).
  await buildStudy({
    title: "Product NPS pulse — Q2",
    tags: ["nps", "product"],
    blocks: [
      blk("nps", { prompt: "How likely are you to recommend us to a colleague?", required: true, leftLabel: "Not at all likely", rightLabel: "Extremely likely" }),
      blk("free-text", { prompt: "What's the main reason for your score?", longForm: true, required: false, maxLength: 500 }),
    ],
    stage: "published",
    responses: 88,
  });

  // 3) Conjoint / MaxDiff pilot (preregistered).
  await buildStudy({
    title: "Feature trade-offs — MaxDiff pilot",
    tags: ["conjoint", "preferences"],
    blocks: [
      blk("text", { contentMd: "For each set, pick the feature you value **most** and **least**." }),
      blk("maxdiff", { prompt: "Which matters most / least to you?", required: true, items: ["Price", "Privacy", "Speed", "Support", "Integrations"] }),
      blk("dropdown", { prompt: "Which plan are you on today?", required: true, options: ["Free", "Pro", "Team", "Enterprise"] }),
    ],
    stage: "preregistered",
    responses: 41,
  });

  // 4) Longitudinal mood (published).
  await buildStudy({
    title: "Daily mood check (longitudinal)",
    tags: ["mood", "wellbeing"],
    blocks: [
      blk("vas", { prompt: "How is your mood right now?", required: true, min: 0, max: 100, leftLabel: "Very low", rightLabel: "Very high" }),
      blk("likert-7", { prompt: "How stressed do you feel today?", leftAnchor: "Not at all", rightAnchor: "Extremely", required: true }),
      blk("matrix-grid", { prompt: "Rate each feeling today:", required: true, rows: ["Calm", "Energetic", "Anxious"], columns: ["Not at all", "A little", "Somewhat", "Very"] }),
    ],
    stage: "published",
    responses: 203,
  });

  // 5) Replication of #1 by Sofia (preregistered, cross-author fork).
  await buildStudy({
    title: "Headline credibility — replication (PL sample)",
    ownerId: sofiaId,
    tags: ["misinformation", "replication"],
    blocks: [...misBlocks.map((b) => ({ ...b, instanceId: ulid() })), blk("attention-check", { prompt: "Select 'Somewhat' to show you're reading.", options: ["Not at all", "Somewhat", "Very"], correct: "Somewhat", required: true })],
    stage: "preregistered",
    responses: 63,
    forkOf: { experimentId: mis.experimentId, versionId: mis.versionId },
  });

  // 6) Archived underpowered pilot.
  await buildStudy({
    title: "Reaction-time priming (pilot — underpowered)",
    tags: ["priming", "pilot"],
    blocks: [
      blk("image", { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Camponotus_flavomarginatus_ant.jpg/320px-Camponotus_flavomarginatus_ant.jpg", alt: "Prime image", caption: "Fixate, then respond." }),
      blk("reaction-time", { prompt: "Press Respond as fast as you can when the word appears.", stimulus: "NOW", minDelayMs: 800, maxDelayMs: 2500 }),
    ],
    stage: "published",
    responses: 14,
    archived: true,
  });

  // 7) WIP draft (no responses).
  await buildStudy({
    title: "Trust in AI-generated news (WIP)",
    tags: ["misinformation", "ai"],
    blocks: [
      blk("social-post", { headline: "[draft stimulus]", body: "", source: "", imageUrl: "", shareCountVisible: false }, "2.0.0"),
      blk("likert-7", { prompt: "How much do you trust this?", leftAnchor: "Not at all", rightAnchor: "Completely", required: true }),
    ],
    stage: "draft",
    responses: 0,
  });

  // A couple of comments on the flagship study.
  for (const [authorId, body] of [
    [mayaId, "Lovely design. Did you counterbalance the post order?"],
    [owner.id, "Not yet — adding that in the next version. Thanks Maya!"],
  ] as const) {
    await db.insert(s.comment).values({
      id: ulid(),
      workspaceId: ws.id,
      authorUserId: authorId,
      targetType: "study",
      targetId: mis.experimentId,
      experimentId: mis.experimentId,
      bodyMd: body,
    });
  }

  // Turn demo content on for this workspace.
  await db.update(s.workspace).set({ showDemoContent: true }).where(eq(s.workspace.id, ws.id));

  console.log(`Done. Demo content is ON for "${ws.name}" (Settings → Appearance to hide).`);
}

// Direct dev run (not when imported by seed-demo-prod.ts): load .env.local + seed.
if (process.argv[1]?.includes("seed-demo-workspace")) {
  config({ path: ".env.local" });
  seedDemoWorkspace((process.argv[2] ?? DEFAULT_EMAIL).toLowerCase())
    .then(() => process.exit(0))
    .catch((e: unknown) => {
      console.error("seed-demo-workspace failed:", e instanceof Error ? e.message : String(e));
      process.exit(1);
    });
}
