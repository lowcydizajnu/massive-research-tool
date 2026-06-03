import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for secrets at rest (per ADR-0005: registry OAuth
 * tokens are never stored plaintext). Key comes from TOKEN_ENCRYPTION_KEY (a
 * base64-encoded 32-byte key). Format: `iv.tag.ciphertext`, all base64.
 */
const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("TOKEN_ENCRYPTION_KEY is not set — see 05_app/.env.local");
  // Accept either a 64-char hex string (`openssl rand -hex 32`) or a
  // base64-encoded 32-byte key (`openssl rand -base64 32`).
  const trimmed = raw.trim();
  const key = /^[0-9a-fA-F]{64}$/.test(trimmed)
    ? Buffer.from(trimmed, "hex")
    : Buffer.from(trimmed, "base64");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64)");
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, ctB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("Malformed encrypted payload");
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
