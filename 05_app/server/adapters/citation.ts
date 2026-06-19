/**
 * CitationAdapter seam (ADR-0007 + ADR-0056). Looking up an article by DOI is a
 * vendor concern (Crossref today); the rest of the app depends only on this
 * interface, so a second source can slot in behind it later. Returns null when
 * the DOI is unknown so callers degrade to manual entry.
 */
export type CitationMetadata = {
  doi: string;
  title: string | null;
  authors: string[];
  year: number | null;
  journal: string | null;
  url: string | null;
  /** Times cited (Crossref `is-referenced-by-count`) — a light "statistic". */
  citedByCount: number | null;
  /** A pre-formatted APA-ish citation string. */
  citation: string;
};

export interface CitationAdapter {
  lookupDoi(doi: string): Promise<CitationMetadata | null>;
}

import { crossrefCitationAdapter } from "@/server/adapters/citation.crossref";

export const citation: CitationAdapter = crossrefCitationAdapter;
