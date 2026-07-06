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
  /** Short-lived URL serving the object (used by the /api/media redirect).
   *  `disposition` is signed INTO the URL (Content-Disposition can't be set on
   *  a 302) — pass "attachment" for participant-uploaded files so a crafted
   *  HTML upload can't execute when opened (ADR-0003 am. 2026-06-13). */
  presignDownload(key: string, expiresSeconds?: number, disposition?: "inline" | "attachment"): Promise<string>;
  /** Hard-delete an object (idempotent — deleting a missing key is a no-op).
   *  Used by study/response erasure (ADR-0082/0083 data-lifecycle). No-op when
   *  storage is unconfigured (local dev) so callers can fire-and-forget. */
  delete(key: string): Promise<void>;
  /** Read an object's bytes SERVER-SIDE. Unlike presign*, this streams the file
   *  through our function — reserved for the rare server-to-server forward
   *  (OSF materials upload, ADR-0094), never the participant/browser path.
   *  Throws when storage is unconfigured or the object is missing. */
  getBytes(key: string): Promise<Uint8Array>;
}

// Active implementation. Switching vendors is a one-line change here.
import { r2Storage } from "./storage.r2";

export const storage: StorageAdapter = r2Storage;
