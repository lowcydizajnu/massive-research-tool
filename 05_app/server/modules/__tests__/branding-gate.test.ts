import { describe, expect, it } from "vitest";

import { customNotificationsNeedingAck, evaluateBrandingGate, imitationModalsNeedingAck, loginScreensNeedingAck } from "@/server/modules/branding-gate";
import {
  ACADEMIC,
  effectiveBrandingTier,
  resolveSocialPost,
  socialPostSchema,
  type StudyTheme,
} from "@/lib/themes/themes";

const UUID = "00000000-0000-4000-8000-00000000abcd";

const post = (instanceId: string, config: Record<string, unknown>) => ({
  instanceId,
  source: "core" as const,
  key: "social-post",
  version: "2.0.0",
  config,
});

const themeWith = (socialPost: Record<string, unknown>): StudyTheme => ({
  ...ACADEMIC,
  socialPost: socialPostSchema.parse(socialPost),
});

const attestation = { attested: true, byUserId: UUID, at: "2026-06-30T00:00:00Z", statement: "IRB approved." };

describe("socialPostSchema + effectiveBrandingTier", () => {
  it("fills sensible defaults from an empty object", () => {
    const s = resolveSocialPost({ socialPost: {} });
    // Default is "layout" (platform look, no logo) — the Design → Social logo
    // toggle's off state (ADR-0084 amendment 2026-07-01). `block` remains valid
    // as a legacy value but is no longer the default nor offered in the UI.
    expect(s.brandingTierDefault).toBe("layout");
    expect(s.reactionsEnabled).toEqual(["like"]);
    expect(s.reactionsLive).toBe(true);
    expect(s.comments.enabled).toBe(false);
    expect(s.irbAttestation).toBeNull();
  });

  it("a per-block tier overrides the study default", () => {
    expect(effectiveBrandingTier({ brandingTier: "branded" }, { brandingTierDefault: "block" })).toBe("branded");
    expect(effectiveBrandingTier({}, { brandingTierDefault: "layout" })).toBe("layout");
    expect(effectiveBrandingTier(null, null)).toBe("block");
    // Garbage per-block value falls back to the study default.
    expect(effectiveBrandingTier({ brandingTier: "nonsense" }, { brandingTierDefault: "layout" })).toBe("layout");
  });
});

describe("evaluateBrandingGate", () => {
  it("passes when there are no social-post blocks", () => {
    const r = evaluateBrandingGate({ blocks: [], theme: ACADEMIC });
    expect(r.requiresAttestation).toBe(false);
    expect(r.ok).toBe(true);
  });

  it("passes a non-branded post (block / layout tiers don't need attestation)", () => {
    const snap = { blocks: [post("a", { brandingTier: "layout" })], theme: themeWith({ brandingTierDefault: "block" }) };
    const r = evaluateBrandingGate(snap);
    expect(r.requiresAttestation).toBe(false);
    expect(r.ok).toBe(true);
  });

  it("blocks a branded post with no logo and no attestation", () => {
    const snap = { blocks: [post("a", { brandingTier: "branded" })], theme: themeWith({}) };
    const r = evaluateBrandingGate(snap);
    expect(r.requiresAttestation).toBe(true);
    expect(r.hasAttestation).toBe(false);
    expect(r.missingLogo.map((m) => m.instanceId)).toEqual(["a"]);
    expect(r.ok).toBe(false);
  });

  it("blocks a branded post that has attestation but is missing its logo", () => {
    const snap = {
      blocks: [post("a", { brandingTier: "branded" })],
      theme: themeWith({ irbAttestation: attestation }),
    };
    const r = evaluateBrandingGate(snap);
    expect(r.hasAttestation).toBe(true);
    expect(r.missingLogo).toHaveLength(1);
    expect(r.ok).toBe(false);
  });

  it("passes a branded post with both a logo and an attestation", () => {
    const snap = {
      blocks: [post("a", { brandingTier: "branded", brandLogoKey: "/api/media/ws/abc/logo.png" })],
      theme: themeWith({ irbAttestation: attestation }),
    };
    const r = evaluateBrandingGate(snap);
    expect(r.requiresAttestation).toBe(true);
    expect(r.missingLogo).toHaveLength(0);
    expect(r.ok).toBe(true);
  });

  it("honors the study-level default tier (no per-block override)", () => {
    const blocks = [post("a", { brandLogoKey: "/api/media/ws/abc/logo.png" })];
    // Default = branded ⇒ the post is branded ⇒ needs attestation.
    expect(evaluateBrandingGate({ blocks, theme: themeWith({ brandingTierDefault: "branded" }) }).ok).toBe(false);
    expect(
      evaluateBrandingGate({
        blocks,
        theme: themeWith({ brandingTierDefault: "branded", irbAttestation: attestation }),
      }).ok,
    ).toBe(true);
  });
});

describe("customNotificationsNeedingAck (ADR-0095 deception gate)", () => {
  const notif = (instanceId: string, config: Record<string, unknown>) => ({
    instanceId,
    source: "core" as const,
    key: "notification",
    version: "1.0.0",
    config,
  });

  it("flags a custom notification missing the deception acknowledgement", () => {
    const snap = { blocks: [notif("n1", { variant: "custom", title: "Account locked", deceptionAck: false })] };
    expect(customNotificationsNeedingAck(snap).map((x) => x.instanceId)).toEqual(["n1"]);
  });

  it("passes when acknowledged, and ignores neutral variants", () => {
    expect(customNotificationsNeedingAck({ blocks: [notif("n1", { variant: "custom", deceptionAck: true })] })).toEqual([]);
    expect(customNotificationsNeedingAck({ blocks: [notif("n2", { variant: "error", title: "x" })] })).toEqual([]);
  });
});

describe("imitationModalsNeedingAck (ADR-0096 deception gate)", () => {
  const modal = (instanceId: string, config: Record<string, unknown>) => ({
    instanceId,
    source: "core" as const,
    key: "modal",
    version: "1.0.0",
    config,
  });

  it("flags an imitation modal missing the deception acknowledgement", () => {
    const snap = { blocks: [modal("m1", { title: "Enable notifications?", imitatesReal: true, deceptionAck: false })] };
    expect(imitationModalsNeedingAck(snap).map((x) => x.instanceId)).toEqual(["m1"]);
  });

  it("passes when acknowledged, and ignores non-imitation modals", () => {
    expect(imitationModalsNeedingAck({ blocks: [modal("m1", { imitatesReal: true, deceptionAck: true })] })).toEqual([]);
    expect(imitationModalsNeedingAck({ blocks: [modal("m2", { imitatesReal: false })] })).toEqual([]);
  });
});

describe("loginScreensNeedingAck (ADR-0098 deception gate)", () => {
  const login = (instanceId: string, config: Record<string, unknown>) => ({
    instanceId,
    source: "core" as const,
    key: "login",
    version: "1.0.0",
    config,
  });

  it("flags a login imitating a real product missing the acknowledgement (imitatesReal defaults on)", () => {
    // Default: imitatesReal absent ⇒ treated as true (a login is deception by default).
    expect(loginScreensNeedingAck({ blocks: [login("l1", { title: "Sign in" })] }).map((x) => x.instanceId)).toEqual(["l1"]);
    expect(loginScreensNeedingAck({ blocks: [login("l2", { imitatesReal: true, deceptionAck: false })] }).map((x) => x.instanceId)).toEqual(["l2"]);
  });

  it("passes when acknowledged, or explicitly not imitating a real product", () => {
    expect(loginScreensNeedingAck({ blocks: [login("l1", { imitatesReal: true, deceptionAck: true })] })).toEqual([]);
    expect(loginScreensNeedingAck({ blocks: [login("l2", { imitatesReal: false })] })).toEqual([]);
  });
});
