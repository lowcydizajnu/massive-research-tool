import { beforeAll, describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "@/server/crypto/tokens";

beforeAll(() => {
  // Deterministic 32-byte test key (base64). Not a real key.
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("token encryption", () => {
  it("round-trips a secret", () => {
    const secret = "osf-access-token-abc123";
    const enc = encryptSecret(secret);
    expect(enc).not.toContain(secret); // ciphertext, not plaintext
    expect(decryptSecret(enc)).toBe(secret);
  });

  it("produces a fresh IV each time (non-deterministic ciphertext)", () => {
    expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
  });

  it("rejects a tampered payload (GCM auth tag)", () => {
    const enc = encryptSecret("secret");
    const [iv, tag, ct] = enc.split(".");
    const tampered = [iv, tag, Buffer.from("evil").toString("base64")].join(".");
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
