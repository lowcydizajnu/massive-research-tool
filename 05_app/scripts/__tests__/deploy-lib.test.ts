import { describe, expect, it } from "vitest";

import { isForbiddenKey, missingKeys, redact } from "@/scripts/deploy-lib";

describe("deploy-lib", () => {
  describe("redact", () => {
    it("masks token-shaped values, keeps short words", () => {
      const out = redact("VERCEL_TOKEN=abcdEFGH1234ijklMNOP5678 ok short=hi");
      expect(out).not.toContain("abcdEFGH1234ijklMNOP5678");
      expect(out).toContain("[redacted]");
      expect(out).toContain("short=hi");
    });
    it("masks a token embedded in a vendor error message", () => {
      // A neutral 24-char token (no real-provider prefix, so secret scanners
      // don't flag the fixture) — exercises the 20+ url-safe-char rule.
      const msg = redact('Vercel 403: bad token "TOKENaaaabbbbccccddddeeee"');
      expect(msg).not.toMatch(/aaaabbbbccccddddeeee/);
    });
  });

  describe("missingKeys", () => {
    it("flags absent + blank keys only", () => {
      const env = { A: "x", B: "", C: "   " };
      expect(missingKeys(env, ["A", "B", "C", "D"])).toEqual(["B", "C", "D"]);
    });
  });

  describe("isForbiddenKey", () => {
    it("matches TOKEN_ENCRYPTION_KEY (any case) and nothing else", () => {
      expect(isForbiddenKey("TOKEN_ENCRYPTION_KEY")).toBe(true);
      expect(isForbiddenKey("token_encryption_key")).toBe(true);
      expect(isForbiddenKey("DATABASE_URL")).toBe(false);
      expect(isForbiddenKey("VERCEL_TOKEN")).toBe(false);
    });
  });
});
