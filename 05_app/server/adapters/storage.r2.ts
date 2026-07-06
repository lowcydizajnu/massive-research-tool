import { AwsClient } from "aws4fetch";

import type { StorageAdapter } from "./storage";

/**
 * Cloudflare R2 implementation of StorageAdapter — the ONLY file importing
 * `aws4fetch` / touching R2 credentials (ADR-0007 adapter discipline; ADR-0003
 * amendment records the choice). Presigned URLs only: the browser PUTs directly
 * to R2 and GETs via a short-lived signed URL — bytes never stream through our
 * functions. Lazy env reads (deploy-safe: nothing throws at import; ADR-0016
 * lazy-init pattern). Unconfigured (local dev without creds) → `configured()`
 * is false and callers surface a friendly "storage not configured" error.
 */
let client: AwsClient | null = null;
let endpoint: string | null = null;

function init(): { client: AwsClient; endpoint: string } | null {
  if (client && endpoint) return { client, endpoint };
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
  endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}`;
  return { client, endpoint };
}

async function presign(
  key: string,
  method: "PUT" | "GET",
  expiresSeconds: number,
  contentType?: string,
  disposition?: "inline" | "attachment",
): Promise<string> {
  const cfg = init();
  if (!cfg) throw new Error("R2 storage is not configured (R2_* env vars missing).");
  const url = new URL(`${cfg.endpoint}/${key}`);
  url.searchParams.set("X-Amz-Expires", String(expiresSeconds));
  // Signed into the URL so it survives the /api/media 302 (a redirect can't add
  // response headers). attachment = force-download, the anti-XSS control for
  // arbitrary participant uploads (ADR-0003 am.).
  if (disposition) url.searchParams.set("response-content-disposition", disposition);
  const signed = await cfg.client.sign(
    new Request(url.toString(), {
      method,
      headers: contentType ? { "Content-Type": contentType } : undefined,
    }),
    { aws: { signQuery: true } },
  );
  return signed.url;
}

export const r2Storage: StorageAdapter = {
  configured: () => init() !== null,
  // Content-Type is part of the signature — the uploader must send exactly the
  // type we validated, so a presign for image/png can't upload text/html.
  presignUpload: (key, contentType, expiresSeconds = 600) =>
    presign(key, "PUT", expiresSeconds, contentType),
  presignDownload: (key, expiresSeconds = 3600, disposition) => presign(key, "GET", expiresSeconds, undefined, disposition),
  // Erasure (ADR-0083). aws4fetch signs + executes the DELETE directly (bytes
  // don't stream through us). R2 returns 204 whether or not the key existed, so
  // it's idempotent. No-op when unconfigured so callers fire-and-forget.
  delete: async (key) => {
    const cfg = init();
    if (!cfg) return;
    const res = await cfg.client.fetch(`${cfg.endpoint}/${key}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) {
      throw new Error(`R2 delete failed for ${key}: ${res.status}`);
    }
  },
  // Server-side read (ADR-0094 OSF materials upload). aws4fetch signs + executes
  // a GET; the bytes DO pass through our function here (the one exception to the
  // presign-only rule), so this path is server-only and never on the hot path.
  getBytes: async (key) => {
    const cfg = init();
    if (!cfg) throw new Error("R2 storage is not configured (R2_* env vars missing).");
    const res = await cfg.client.fetch(`${cfg.endpoint}/${key}`, { method: "GET" });
    if (!res.ok) {
      throw new Error(`R2 read failed for ${key}: ${res.status}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  },
};
