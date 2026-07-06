import { describe, expect, it } from "vitest";

import { classifyBareOverlay, OVERLAY_KEYS } from "@/lib/take/bare-overlay";

describe("classifyBareOverlay (ADR-0096 am.)", () => {
  it("flags a lone imitation surface as its own bare-overlay kind", () => {
    expect(classifyBareOverlay([{ key: "modal" }])).toEqual({ bareModal: true, bareLogin: false, bareNotification: false, bareOverlay: true });
    expect(classifyBareOverlay([{ key: "login" }])).toEqual({ bareModal: false, bareLogin: true, bareNotification: false, bareOverlay: true });
    expect(classifyBareOverlay([{ key: "notification" }])).toEqual({ bareModal: false, bareLogin: false, bareNotification: true, bareOverlay: true });
  });

  it("requires EVERY block to be the same key — a mixed screen falls through to normal rendering", () => {
    // login + a question → NOT a bare login (the full-screen takeover only applies
    // when the block truly owns the screen).
    expect(classifyBareOverlay([{ key: "login" }, { key: "likert-7" }]).bareOverlay).toBe(false);
    expect(classifyBareOverlay([{ key: "notification" }, { key: "free-text" }]).bareOverlay).toBe(false);
    // Two different overlays on one screen is also not "bare" of either.
    expect(classifyBareOverlay([{ key: "modal" }, { key: "notification" }]).bareOverlay).toBe(false);
  });

  it("is all-false for a normal content screen or an empty screen", () => {
    expect(classifyBareOverlay([{ key: "likert-7" }]).bareOverlay).toBe(false);
    expect(classifyBareOverlay([]).bareOverlay).toBe(false);
  });

  it("OVERLAY_KEYS covers the three imitation surfaces (used to strip them from the backdrop)", () => {
    expect([...OVERLAY_KEYS].sort()).toEqual(["login", "modal", "notification"]);
  });
});
