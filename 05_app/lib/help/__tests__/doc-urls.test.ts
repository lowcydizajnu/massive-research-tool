import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DOC_URLS, DOCS_BASE, docUrl, type HelpDocKey } from "@/lib/help/doc-urls";

// Repo root is one level up from the app cwd (05_app) where vitest runs.
const DOCS_DIR = join(process.cwd(), "..", "docs");

describe("DOC_URLS (EE4, ADR-0078)", () => {
  it("every path is absolute and docUrl prefixes the docs base", () => {
    for (const [key, path] of Object.entries(DOC_URLS)) {
      expect(path.startsWith("/")).toBe(true);
      expect(docUrl(key as HelpDocKey)).toBe(`${DOCS_BASE}${path}`);
    }
  });

  // Doubles as the "missing docs" guard (ADR-0078): a link with no page fails CI.
  it("every doc link resolves to an .mdx page under docs/", () => {
    const missing: string[] = [];
    for (const path of Object.values(DOC_URLS)) {
      if (!existsSync(join(DOCS_DIR, `${path}.mdx`))) missing.push(`${path}.mdx`);
    }
    expect(missing).toEqual([]);
  });
});
