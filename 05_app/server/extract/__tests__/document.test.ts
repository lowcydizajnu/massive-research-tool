import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  EXTRACT_MAX_CHARS,
  classifyDocument,
  extractDocumentText,
} from "@/server/extract/document";

// Confine the vendor libraries to mocks — the seam (ADR-0062) means the unit
// under test is our dispatch/tidy/cap logic, not pdf.js/mammoth internals.
const extractTextMock = vi.fn();
const getDocumentProxyMock = vi.fn();
const mammothExtractRawTextMock = vi.fn();

vi.mock("unpdf", () => ({
  extractText: (...a: unknown[]) => extractTextMock(...a),
  getDocumentProxy: (...a: unknown[]) => getDocumentProxyMock(...a),
}));
vi.mock("mammoth", () => ({
  extractRawText: (...a: unknown[]) => mammothExtractRawTextMock(...a),
}));

const buf = (s: string) => new TextEncoder().encode(s).buffer;

beforeEach(() => {
  vi.clearAllMocks();
  getDocumentProxyMock.mockResolvedValue({ _pdf: true });
});

describe("classifyDocument", () => {
  it("recognises pdf by extension and mime", () => {
    expect(classifyDocument("paper.pdf", "")).toBe("pdf");
    expect(classifyDocument("paper", "application/pdf")).toBe("pdf");
  });
  it("recognises docx by extension and mime", () => {
    expect(classifyDocument("notes.docx", "")).toBe("docx");
    expect(
      classifyDocument("notes", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ).toBe("docx");
  });
  it("recognises text formats (extension wins over flaky browser mime)", () => {
    expect(classifyDocument("a.md", "")).toBe("text");
    expect(classifyDocument("a.csv", "application/octet-stream")).toBe("text");
    expect(classifyDocument("a", "text/plain")).toBe("text");
    expect(classifyDocument("a", "application/json")).toBe("text");
  });
  it("returns null for unsupported types", () => {
    expect(classifyDocument("image.png", "image/png")).toBeNull();
    expect(classifyDocument("legacy.doc", "application/msword")).toBeNull();
  });
});

describe("extractDocumentText", () => {
  it("extracts a PDF (string output) and tidies it", async () => {
    extractTextMock.mockResolvedValue({ text: "Hello\r\n\r\n\r\nWorld   \n" });
    const r = await extractDocumentText(buf("ignored"), "p.pdf", "application/pdf");
    expect(getDocumentProxyMock).toHaveBeenCalledOnce();
    expect(r.text).toBe("Hello\n\nWorld");
    expect(r.truncated).toBe(false);
  });

  it("joins a PDF whose pages come back as an array", async () => {
    extractTextMock.mockResolvedValue({ text: ["page one", "page two"] });
    const r = await extractDocumentText(buf("x"), "p.pdf", "application/pdf");
    expect(r.text).toBe("page one\n\npage two");
  });

  it("extracts a DOCX via mammoth", async () => {
    mammothExtractRawTextMock.mockResolvedValue({ value: "Doc body" });
    const r = await extractDocumentText(buf("x"), "n.docx", "");
    expect(mammothExtractRawTextMock).toHaveBeenCalledOnce();
    expect(r.text).toBe("Doc body");
  });

  it("reads a text file without touching the parsers", async () => {
    const r = await extractDocumentText(buf("plain text here"), "a.txt", "text/plain");
    expect(extractTextMock).not.toHaveBeenCalled();
    expect(mammothExtractRawTextMock).not.toHaveBeenCalled();
    expect(r.text).toBe("plain text here");
  });

  it("throws 'empty' when a (scanned) PDF yields no text", async () => {
    extractTextMock.mockResolvedValue({ text: "   \n\n  " });
    await expect(extractDocumentText(buf("x"), "scan.pdf", "application/pdf")).rejects.toThrow("empty");
  });

  it("throws 'unsupported' for an unknown type", async () => {
    await expect(extractDocumentText(buf("x"), "a.png", "image/png")).rejects.toThrow("unsupported");
  });

  it("caps output at EXTRACT_MAX_CHARS and reports truncated", async () => {
    const big = "a".repeat(EXTRACT_MAX_CHARS + 500);
    extractTextMock.mockResolvedValue({ text: big });
    const r = await extractDocumentText(buf("x"), "p.pdf", "application/pdf");
    expect(r.text.length).toBe(EXTRACT_MAX_CHARS);
    expect(r.chars).toBe(EXTRACT_MAX_CHARS + 500);
    expect(r.truncated).toBe(true);
  });
});
