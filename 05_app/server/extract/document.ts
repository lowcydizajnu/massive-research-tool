/**
 * Document text extraction (ADR-0062) — the swap seam.
 *
 * Deterministic, server-side parsing of a researcher-uploaded file into plain
 * text for the AI conversation block's context (ADR-0061). This is NOT an AI
 * Task: it calls no model, so it lives here as a plain utility rather than
 * behind `AIProviderAdapter`. The vendor libraries (`unpdf` for PDF, `mammoth`
 * for DOCX) are imported ONLY in this file — swapping a parser (or moving to a
 * sandboxed job / an OCR provider) is a one-file change. See the
 * "Document extraction" row in `04_architecture/lock-in-inventory.md`.
 */

/** Hard ceiling on the uploaded file (defence against oversized parse work). */
export const EXTRACT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
/** Keep only this many characters of extracted text (matches the client text path). */
export const EXTRACT_MAX_CHARS = 100_000;

export type ExtractKind = "pdf" | "docx" | "text";

const TEXT_EXTS = ["txt", "md", "markdown", "csv", "tsv", "json", "text", "log"];

/**
 * Decide how to read a file from its name + MIME type. Returns null for formats
 * we don't support (the caller answers 415). Extension wins because browser MIME
 * for .md/.csv is inconsistent.
 */
export function classifyDocument(filename: string, mime: string | null | undefined): ExtractKind | null {
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  const m = (mime ?? "").toLowerCase();
  if (ext === "pdf" || m === "application/pdf") return "pdf";
  if (ext === "docx" || m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (TEXT_EXTS.includes(ext) || m.startsWith("text/") || m === "application/json") return "text";
  return null;
}

/** Tidy parser output: normalise newlines, collapse runs of blank lines, trim. */
function tidy(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type ExtractResult = { text: string; chars: number; truncated: boolean };

/**
 * Extract plain text from a PDF / DOCX / text file. Throws `Error("empty")` when
 * the document yields no usable text (e.g. a scanned PDF with no text layer) so
 * the caller can return a clear message rather than silently appending nothing.
 */
export async function extractDocumentText(
  bytes: ArrayBuffer,
  filename: string,
  mime: string | null | undefined,
): Promise<ExtractResult> {
  const kind = classifyDocument(filename, mime);
  if (!kind) throw new Error("unsupported");

  let text: string;
  if (kind === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const out = await extractText(pdf, { mergePages: true });
    text = Array.isArray(out.text) ? out.text.join("\n\n") : out.text;
  } else if (kind === "docx") {
    const mammoth = await import("mammoth");
    const fn = mammoth.extractRawText ?? mammoth.default?.extractRawText;
    const out = await fn({ buffer: Buffer.from(bytes) });
    text = out.value;
  } else {
    text = new TextDecoder().decode(bytes);
  }

  const tidied = tidy(text);
  if (!tidied) throw new Error("empty");
  const truncated = tidied.length > EXTRACT_MAX_CHARS;
  return { text: tidied.slice(0, EXTRACT_MAX_CHARS), chars: tidied.length, truncated };
}
