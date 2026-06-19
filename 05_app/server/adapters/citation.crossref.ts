import type { CitationAdapter, CitationMetadata } from "@/server/adapters/citation";

/**
 * Crossref implementation of CitationAdapter (ADR-0056). `GET
 * https://api.crossref.org/works/{doi}` — public, no key. We send a `mailto`
 * (the "polite pool", from CROSSREF_MAILTO or the app contact) for better
 * rate-limiting. The only file that knows about Crossref's response shape; all
 * vendor specifics stay here per ADR-0007.
 */
const MAILTO = process.env.CROSSREF_MAILTO || "hello@myresearchlab.app";

/** Strip a doi.org URL / `doi:` prefix down to the bare DOI. */
function normalizeDoi(input: string): string | null {
  const t = input.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:/i, "").trim();
  return /^10\.\d{4,9}\/\S+$/.test(t) ? t : null;
}

type CrossrefMsg = {
  DOI?: string;
  title?: string[];
  author?: { given?: string; family?: string; name?: string }[];
  "container-title"?: string[];
  issued?: { "date-parts"?: number[][] };
  URL?: string;
  "is-referenced-by-count"?: number;
};

function formatAuthors(authors: { given?: string; family?: string; name?: string }[]): string[] {
  return authors.map((a) => a.name ?? [a.family, a.given].filter(Boolean).join(", ")).filter(Boolean);
}

export const crossrefCitationAdapter: CitationAdapter = {
  async lookupDoi(input: string): Promise<CitationMetadata | null> {
    const doi = normalizeDoi(input);
    if (!doi) return null;

    let res: Response;
    try {
      res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}?mailto=${encodeURIComponent(MAILTO)}`, {
        headers: { Accept: "application/json", "User-Agent": `MassiveResearchLab (mailto:${MAILTO})` },
        // Don't hang a request on a slow registry.
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return null;
    }
    if (!res.ok) return null;

    const body = (await res.json().catch(() => null)) as { message?: CrossrefMsg } | null;
    const m = body?.message;
    if (!m) return null;

    const authors = formatAuthors(m.author ?? []);
    const title = m.title?.[0] ?? null;
    const journal = m["container-title"]?.[0] ?? null;
    const year = m.issued?.["date-parts"]?.[0]?.[0] ?? null;
    const url = m.URL ?? `https://doi.org/${doi}`;
    const citedByCount = typeof m["is-referenced-by-count"] === "number" ? m["is-referenced-by-count"] : null;

    const authorStr = authors.length ? (authors.length > 3 ? `${authors[0]} et al.` : authors.join("; ")) : "Unknown author";
    const citation = `${authorStr}${year ? ` (${year})` : ""}. ${title ?? "Untitled"}.${journal ? ` ${journal}.` : ""} https://doi.org/${doi}`;

    return { doi, title, authors, year, journal, url, citedByCount, citation };
  },
};
