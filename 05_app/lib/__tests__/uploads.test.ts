import { describe, expect, it } from "vitest";

import { isSafeMediaKey, validateUpload } from "@/lib/uploads";

describe("upload validation (ADR-0003)", () => {
  it("allowlists content types per kind and maps extensions", () => {
    expect(validateUpload("image", "image/png", 1000)).toEqual({ ok: true, ext: "png" });
    expect(validateUpload("audio", "audio/webm;codecs=opus", 1000)).toEqual({ ok: true, ext: "webm" });
    expect(validateUpload("image", "text/html", 1000).ok).toBe(false);
    expect(validateUpload("video", "video/x-msvideo", 1000).ok).toBe(false);
  });
  it("enforces size caps and rejects empty files", () => {
    expect(validateUpload("image", "image/png", 10 * 1024 * 1024 + 1).ok).toBe(false);
    expect(validateUpload("image", "image/png", 0).ok).toBe(false);
    expect(validateUpload("video", "video/mp4", 150 * 1024 * 1024).ok).toBe(true);
  });
  it("media keys: only our namespaces, no traversal", () => {
    expect(isSafeMediaKey("ws/abc-123/01H.png")).toBe(true);
    expect(isSafeMediaKey("resp/01H/clip.webm")).toBe(true);
    expect(isSafeMediaKey("etc/passwd")).toBe(false);
    expect(isSafeMediaKey("ws/../secret")).toBe(false);
    expect(isSafeMediaKey("ws/a?x=1")).toBe(false);
  });
});

describe("document upload kind (Wave 4)", () => {
  it("accepts research doc types, rejects executables, caps at 25MB", () => {
    expect(validateUpload("document", "application/pdf", 1000).ok).toBe(true);
    expect(validateUpload("document", "text/csv", 1000).ok).toBe(true);
    expect(validateUpload("document", "text/html", 1000).ok).toBe(false);
    expect(validateUpload("document", "application/pdf", 30 * 1024 * 1024).ok).toBe(false);
  });
});
