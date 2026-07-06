import { renderToBuffer } from "@react-pdf/renderer";

import { StudyPdfDocument, type StudyPdfData } from "@/components/feature/overview/study-pdf";
import { extractMaterials } from "@/lib/study-record/materials";
import type { MaterialFile } from "@/server/adapters/registry";
import { storage } from "@/server/adapters/storage";
import { readBlocks } from "@/server/modules/blocks";

/**
 * Assemble the files a study uploads to OSF (ADR-0094): its stimulus materials
 * (from the frozen version), the machine-readable design snapshot, and a
 * human-readable protocol PDF. Pure planning is split from byte-fetching so the
 * panel can list artifacts without touching R2, and so the assembly is testable
 * (inject `getBytes` / `renderPdf`). Participant response media is never included.
 */

/** The OSF osfstorage folder study materials land in. */
export const OSF_MATERIALS_FOLDER = "My Research Lab materials";
/** Per-file cap on the inline upload path — larger files are skipped (never
 *  streamed through the function). ADR-0094 revisit trigger: move to a job. */
export const OSF_MATERIAL_MAX_BYTES = 100 * 1024 * 1024;

const DESIGN_JSON = "design-snapshot.json";
const PROTOCOL_PDF = "protocol.pdf";

export type OsfArtifactKind = "stimulus" | "design-json" | "protocol-pdf";

export type PlannedArtifact = {
  kind: OsfArtifactKind;
  /** Stable identity for idempotency: the R2 key for a stimulus, else the sentinel filename. */
  artifactKey: string;
  fileName: string;
};

/** Last path segment of an R2 key, sanitized for OSF (no slashes). */
function osfBasename(key: string): string {
  const raw = key.split("/").filter(Boolean).pop() ?? "file";
  return raw.replace(/[^a-zA-Z0-9._-]+/g, "_") || "file";
}

/** Ensure a filename is unique within the folder by suffixing "-2", "-3", … */
function uniqueName(name: string, seen: Set<string>): string {
  if (!seen.has(name)) {
    seen.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let i = 2;
  let candidate = `${base}-${i}${ext}`;
  while (seen.has(candidate)) {
    i += 1;
    candidate = `${base}-${i}${ext}`;
  }
  seen.add(candidate);
  return candidate;
}

/**
 * Resolve the bare R2 object key from a material's stored config value. The
 * Builder stores image/video fields as the browser URL `/api/media/<key>` (so
 * `<img src>` just works); R2 `getBytes` needs the bare key (`ws/…`). A pasted
 * external `http(s)://` image isn't one of our objects → null (can't upload).
 */
export function materialR2Key(url: string): string | null {
  let s = url.trim();
  if (/^https?:\/\//i.test(s)) return null; // external URL — not an R2 object
  s = s.replace(/^\/?api\/media\//, ""); // strip the media-gateway prefix
  s = s.replace(/^\/+/, ""); // and any leading slash
  return /^(ws|resp)\/[^\s]+/.test(s) ? s : null;
}

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  pdf: "application/pdf", json: "application/json", csv: "text/csv", txt: "text/plain",
};

function contentTypeForName(name: string): string {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/** The artifacts a study will upload — pure over the frozen snapshot. The two
 *  generated artifacts always exist; stimuli come from the version's blocks. */
export function planOsfArtifacts(snapshot: unknown): PlannedArtifact[] {
  const out: PlannedArtifact[] = [];
  const seen = new Set<string>();
  for (const m of extractMaterials(readBlocks(snapshot))) {
    out.push({ kind: "stimulus", artifactKey: m.url, fileName: uniqueName(osfBasename(m.url), seen) });
  }
  out.push({ kind: "design-json", artifactKey: DESIGN_JSON, fileName: uniqueName(DESIGN_JSON, seen) });
  out.push({ kind: "protocol-pdf", artifactKey: PROTOCOL_PDF, fileName: uniqueName(PROTOCOL_PDF, seen) });
  return out;
}

export type SkippedArtifact = { kind: OsfArtifactKind; artifactKey: string; fileName: string; sizeBytes: number };
export type FailedArtifact = { kind: OsfArtifactKind; artifactKey: string; fileName: string; error: string };

async function defaultRenderPdf(data: StudyPdfData): Promise<Uint8Array> {
  return new Uint8Array(await renderToBuffer(<StudyPdfDocument data={data} />));
}

/**
 * Build the byte payloads to upload. Stimulus reads and the PDF render can fail
 * or be oversized per-artifact; those are reported (not thrown) so one bad file
 * never aborts the batch. `existingByKey` maps an artifactKey to its prior OSF
 * file id so a re-push updates in place (a new version).
 */
export async function assembleOsfMaterialFiles(input: {
  snapshot: unknown;
  pdfData: StudyPdfData;
  existingByKey: Map<string, string>;
  maxBytes?: number;
  getBytes?: (key: string) => Promise<Uint8Array>;
  renderPdf?: (data: StudyPdfData) => Promise<Uint8Array>;
}): Promise<{ files: MaterialFile[]; skipped: SkippedArtifact[]; failed: FailedArtifact[] }> {
  const max = input.maxBytes ?? OSF_MATERIAL_MAX_BYTES;
  const getBytes = input.getBytes ?? ((k) => storage.getBytes(k));
  const renderPdf = input.renderPdf ?? defaultRenderPdf;
  const planned = planOsfArtifacts(input.snapshot);

  const files: MaterialFile[] = [];
  const skipped: SkippedArtifact[] = [];
  const failed: FailedArtifact[] = [];

  for (const a of planned) {
    try {
      let bytes: Uint8Array;
      let contentType: string;
      if (a.kind === "stimulus") {
        const key = materialR2Key(a.artifactKey);
        if (!key) {
          failed.push({
            kind: a.kind,
            artifactKey: a.artifactKey,
            fileName: a.fileName,
            error: "External image URL — not stored in your workspace, so it can't be uploaded to OSF.",
          });
          continue;
        }
        bytes = await getBytes(key);
        contentType = contentTypeForName(a.fileName);
      } else if (a.kind === "design-json") {
        bytes = new TextEncoder().encode(JSON.stringify(input.snapshot ?? {}, null, 2));
        contentType = "application/json";
      } else {
        bytes = await renderPdf(input.pdfData);
        contentType = "application/pdf";
      }
      if (bytes.byteLength > max) {
        skipped.push({ kind: a.kind, artifactKey: a.artifactKey, fileName: a.fileName, sizeBytes: bytes.byteLength });
        continue;
      }
      files.push({
        artifactKey: a.artifactKey,
        fileName: a.fileName,
        bytes,
        contentType,
        existingOsfFileId: input.existingByKey.get(a.artifactKey) ?? null,
      });
    } catch (e) {
      failed.push({ kind: a.kind, artifactKey: a.artifactKey, fileName: a.fileName, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { files, skipped, failed };
}
