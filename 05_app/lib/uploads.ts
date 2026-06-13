/**
 * Upload validation rules (ADR-0003 amendment) — pure + shared by the
 * researcher presign mutation, the participant audio endpoint, and tests.
 * Content-type allowlists per kind (the type is also SIGNED into the presigned
 * PUT, so what we validate is what R2 accepts) + size caps.
 */
export const UPLOAD_KINDS = {
  image: {
    maxBytes: 10 * 1024 * 1024,
    types: {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "image/gif": "gif",
    } as Record<string, string>,
  },
  video: {
    maxBytes: 200 * 1024 * 1024,
    types: {
      "video/mp4": "mp4",
      "video/webm": "webm",
      "video/quicktime": "mov",
    } as Record<string, string>,
  },
  document: {
    maxBytes: 25 * 1024 * 1024,
    types: {
      "application/pdf": "pdf",
      "text/plain": "txt",
      "text/csv": "csv",
      "image/png": "png",
      "image/jpeg": "jpg",
      "application/msword": "doc",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
      "application/vnd.ms-excel": "xls",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
      "application/zip": "zip",
    } as Record<string, string>,
  },
  audio: {
    maxBytes: 25 * 1024 * 1024,
    types: {
      "audio/webm": "webm",
      "audio/mp4": "m4a",
      "audio/mpeg": "mp3",
      "audio/wav": "wav",
      "audio/ogg": "ogg",
    } as Record<string, string>,
  },
} as const;
export type UploadKind = keyof typeof UPLOAD_KINDS;

/** Validate a proposed upload; returns the file extension to store under. */
export function validateUpload(
  kind: UploadKind,
  contentType: string,
  sizeBytes: number,
): { ok: true; ext: string } | { ok: false; error: string } {
  const rules = UPLOAD_KINDS[kind];
  // MediaRecorder emits e.g. "audio/webm;codecs=opus" — match on the bare type.
  const bare = contentType.split(";")[0].trim().toLowerCase();
  const ext = rules.types[bare];
  if (!ext) return { ok: false, error: `That file type isn’t supported for ${kind} uploads.` };
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return { ok: false, error: "Empty file." };
  if (sizeBytes > rules.maxBytes) {
    return { ok: false, error: `File too large — the ${kind} limit is ${Math.round(rules.maxBytes / 1024 / 1024)} MB.` };
  }
  return { ok: true, ext };
}

/**
 * A storage key is safe to serve when it's one of OUR namespaces and contains
 * no traversal / signature-breaking characters. (`ws/` = researcher uploads,
 * `resp/` = participant recordings.)
 */
export function isSafeMediaKey(key: string): boolean {
  return /^(ws|resp)\/[A-Za-z0-9][A-Za-z0-9/_.-]*$/.test(key) && !key.includes("..") && key.length <= 300;
}
