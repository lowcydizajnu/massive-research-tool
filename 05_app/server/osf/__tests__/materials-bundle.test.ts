import { describe, expect, it } from "vitest";

import { assembleOsfMaterialFiles, materialR2Key, planOsfArtifacts } from "@/server/osf/materials-bundle";
import type { StudyPdfData } from "@/components/feature/overview/study-pdf";

// Real config stores the browser media-gateway URL, NOT a bare R2 key.
const SNAPSHOT = {
  blocks: [
    { key: "image", source: "core", version: "1.0.0", config: { url: "/api/media/ws/w1/stim.png" } },
    { key: "social-post", source: "core", version: "2.0.0", config: { imageUrl: "/api/media/ws/w1/post.jpg" } },
    { key: "likert-7", source: "core", version: "1.0.0", config: { prompt: "no media here" } },
  ],
};

const PDF_DATA = { title: "T" } as unknown as StudyPdfData;

describe("materialR2Key", () => {
  it("strips the /api/media gateway prefix to a bare R2 key", () => {
    expect(materialR2Key("/api/media/ws/w1/stim.png")).toBe("ws/w1/stim.png");
    expect(materialR2Key("api/media/ws/w1/stim.png")).toBe("ws/w1/stim.png");
  });
  it("passes a bare key through", () => {
    expect(materialR2Key("ws/w1/stim.png")).toBe("ws/w1/stim.png");
  });
  it("returns null for an external URL or a non-workspace value", () => {
    expect(materialR2Key("https://example.com/x.png")).toBeNull();
    expect(materialR2Key("http://cdn.test/y.jpg")).toBeNull();
    expect(materialR2Key("not-a-key")).toBeNull();
  });
});

describe("planOsfArtifacts", () => {
  it("lists each stimulus once plus the design JSON and protocol PDF", () => {
    const plan = planOsfArtifacts(SNAPSHOT);
    expect(plan.map((p) => p.kind)).toEqual(["stimulus", "stimulus", "design-json", "protocol-pdf"]);
    expect(plan.map((p) => p.artifactKey)).toEqual([
      "/api/media/ws/w1/stim.png",
      "/api/media/ws/w1/post.jpg",
      "design-snapshot.json",
      "protocol.pdf",
    ]);
    expect(plan.map((p) => p.fileName)).toEqual(["stim.png", "post.jpg", "design-snapshot.json", "protocol.pdf"]);
  });

  it("de-duplicates colliding stimulus filenames", () => {
    const plan = planOsfArtifacts({
      blocks: [
        { key: "image", source: "core", version: "1.0.0", config: { url: "ws/a/pic.png" } },
        { key: "image", source: "core", version: "1.0.0", config: { url: "ws/b/pic.png" } },
      ],
    });
    expect(plan.filter((p) => p.kind === "stimulus").map((p) => p.fileName)).toEqual(["pic.png", "pic-2.png"]);
  });
});

describe("assembleOsfMaterialFiles", () => {
  const getBytes = async (k: string) => new TextEncoder().encode(`bytes:${k}`);
  const renderPdf = async () => new Uint8Array([37, 80, 68, 70]); // "%PDF"

  it("fetches stimulus bytes, serializes the JSON, renders the PDF, and maps existing ids", async () => {
    const { files, skipped, failed } = await assembleOsfMaterialFiles({
      snapshot: SNAPSHOT,
      pdfData: PDF_DATA,
      existingByKey: new Map([["protocol.pdf", "pf1"]]),
      getBytes,
      renderPdf,
    });
    expect(skipped).toEqual([]);
    expect(failed).toEqual([]);
    expect(files.map((f) => f.fileName)).toEqual(["stim.png", "post.jpg", "design-snapshot.json", "protocol.pdf"]);
    // artifactKey keeps the config value; getBytes is called with the BARE R2 key.
    expect(files[0]).toMatchObject({ artifactKey: "/api/media/ws/w1/stim.png", contentType: "image/png" });
    expect(new TextDecoder().decode(files[0].bytes)).toBe("bytes:ws/w1/stim.png");
    expect(files[1]).toMatchObject({ contentType: "image/jpeg" });
    expect(files[2]).toMatchObject({ contentType: "application/json" });
    // The design JSON is the serialized snapshot.
    expect(JSON.parse(new TextDecoder().decode(files[2].bytes))).toEqual(SNAPSHOT);
    // The protocol PDF reuses its known OSF id for an in-place new version.
    expect(files[3]).toMatchObject({ contentType: "application/pdf", existingOsfFileId: "pf1" });
    expect(files[0].existingOsfFileId).toBeNull();
  });

  it("skips an oversized artifact instead of streaming it", async () => {
    const { files, skipped } = await assembleOsfMaterialFiles({
      snapshot: SNAPSHOT,
      pdfData: PDF_DATA,
      existingByKey: new Map(),
      maxBytes: 8, // "bytes:ws/w1/stim.png" is longer than 8
      getBytes,
      renderPdf,
    });
    expect(skipped.some((s) => s.artifactKey === "/api/media/ws/w1/stim.png")).toBe(true);
    expect(files.some((f) => f.artifactKey === "/api/media/ws/w1/stim.png")).toBe(false);
  });

  it("reports a byte-read failure without aborting the batch", async () => {
    const { files, failed } = await assembleOsfMaterialFiles({
      snapshot: SNAPSHOT,
      pdfData: PDF_DATA,
      existingByKey: new Map(),
      getBytes: async (k) => {
        if (k === "ws/w1/post.jpg") throw new Error("R2 read failed for " + k);
        return new Uint8Array([1]);
      },
      renderPdf,
    });
    expect(failed.map((f) => f.artifactKey)).toEqual(["/api/media/ws/w1/post.jpg"]);
    // The other three artifacts still assembled.
    expect(files.map((f) => f.artifactKey)).toEqual([
      "/api/media/ws/w1/stim.png",
      "design-snapshot.json",
      "protocol.pdf",
    ]);
  });

  it("reports an external image URL as failed without hitting R2", async () => {
    let called = 0;
    const { files, failed } = await assembleOsfMaterialFiles({
      snapshot: { blocks: [{ key: "image", source: "core", version: "1.0.0", config: { url: "https://example.com/pic.png" } }] },
      pdfData: PDF_DATA,
      existingByKey: new Map(),
      getBytes: async (k) => {
        called += 1;
        return new TextEncoder().encode(`bytes:${k}`);
      },
      renderPdf,
    });
    expect(called).toBe(0); // never tried to read it from R2
    expect(failed.map((f) => f.artifactKey)).toEqual(["https://example.com/pic.png"]);
    expect(failed[0].error).toMatch(/External image URL/);
    // JSON + PDF still uploaded.
    expect(files.map((f) => f.fileName)).toEqual(["design-snapshot.json", "protocol.pdf"]);
  });
});
