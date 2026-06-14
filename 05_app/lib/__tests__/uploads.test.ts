import { describe, expect, it } from "vitest";

import { isSafeMediaKey, mediaKindForField, validateUpload } from "@/lib/uploads";

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

describe("Configure-form media field detection (ADR-0041 — upload from disk)", () => {
  it("offers image upload on imageUrl for every image-interaction/timed block + social-post", () => {
    for (const k of ["heat-map", "hot-spot", "graphic-slider", "timed-exposure", "social-post"]) {
      expect(mediaKindForField(k, "imageUrl")).toBe("image");
    }
  });
  it("keeps image.url=image and video.url=video; offers nothing elsewhere", () => {
    expect(mediaKindForField("image", "url")).toBe("image");
    expect(mediaKindForField("video", "url")).toBe("video");
    expect(mediaKindForField("signature", "imageUrl")).toBeNull(); // signature has no imageUrl
    expect(mediaKindForField("hot-spot", "regions")).toBeNull(); // text array, not an image field
    expect(mediaKindForField("free-text", "prompt")).toBeNull();
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
