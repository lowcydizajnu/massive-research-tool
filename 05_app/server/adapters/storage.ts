/**
 * StorageAdapter — the vendor-agnostic asset-storage surface (ADR-0003 +
 * ADR-0007). Feature code presigns uploads/downloads through this interface;
 * the vendor (Cloudflare R2 via aws4fetch) lives only in `storage.r2.ts`.
 * Swapping to S3/MinIO later is a new impl file + the one-line export below
 * (see the R2 row in lock-in-inventory.md).
 */
export interface StorageAdapter {
  /** False when the R2_* env vars are absent (local dev without creds). */
  configured(): boolean;
  /** Short-lived URL the browser PUTs the file to (Content-Type is signed). */
  presignUpload(key: string, contentType: string, expiresSeconds?: number): Promise<string>;
  /** Short-lived URL serving the object (used by the /api/media redirect). */
  presignDownload(key: string, expiresSeconds?: number): Promise<string>;
}

// Active implementation. Switching vendors is a one-line change here.
import { r2Storage } from "./storage.r2";

export const storage: StorageAdapter = r2Storage;
