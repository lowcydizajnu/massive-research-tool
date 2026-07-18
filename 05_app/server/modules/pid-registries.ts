/**
 * Thin, server-side lookups against the public PID registries used by LOS item ⑩
 * (ADR-0108): ROR (institutions) and the Crossref Funder Registry. Keyless,
 * read-only — this is the single seam that owns the polite User-Agent, the
 * timeout, and the "never throw, degrade to `[]`" contract, so a registry being
 * slow or down can never block a save (the researcher falls back to free text).
 *
 * Not a vendor SDK, so ADR-0007's SDK-only-in-adapters rule doesn't apply; if
 * either API ever needs auth or changes shape, this module is where it's adapted.
 */

export type RorHit = { id: string; name: string; country?: string };
export type FunderHit = { id: string; name: string; uri: string; country?: string };

const TIMEOUT_MS = 6000;
const MAX = 8;
// Crossref asks for a mailto in the User-Agent (the "polite pool"); harmless to ROR.
const UA = "MassiveResearchTool/1.0 (https://myresearchlab.app; mailto:hello@myresearchlab.app)";

async function getJson(url: string): Promise<unknown | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // timeout, network, or bad JSON — the caller returns []
  } finally {
    clearTimeout(t);
  }
}

/** Institutions from ROR v2. `id` is the ROR URL (e.g. https://ror.org/00f54p054). */
export async function searchRor(query: string): Promise<RorHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const data = (await getJson(`https://api.ror.org/v2/organizations?query=${encodeURIComponent(q)}`)) as
    | { items?: unknown[] }
    | null;
  const items = Array.isArray(data?.items) ? data!.items! : [];
  const hits: RorHit[] = [];
  for (const raw of items.slice(0, MAX)) {
    const it = raw as {
      id?: string;
      names?: { value?: string; types?: string[] }[];
      locations?: { geonames_details?: { country_name?: string } }[];
    };
    if (typeof it.id !== "string") continue;
    // The display name is the `ror_display`-typed name; fall back to the first.
    const display = it.names?.find((n) => n.types?.includes("ror_display"))?.value ?? it.names?.[0]?.value;
    if (!display) continue;
    hits.push({ id: it.id, name: display, country: it.locations?.[0]?.geonames_details?.country_name });
  }
  return hits;
}

/** Funders from the Crossref Funder Registry. `id` is the registry id; `uri` its DOI. */
export async function searchFunders(query: string): Promise<FunderHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const data = (await getJson(`https://api.crossref.org/funders?query=${encodeURIComponent(q)}&rows=${MAX}`)) as
    | { message?: { items?: unknown[] } }
    | null;
  const items = Array.isArray(data?.message?.items) ? data!.message!.items! : [];
  const hits: FunderHit[] = [];
  for (const raw of items) {
    const it = raw as { id?: string; name?: string; uri?: string; location?: string };
    if (typeof it.id !== "string" || typeof it.name !== "string") continue;
    // Normalise the DOI to https://doi.org/… (Crossref returns http://dx.doi.org/…).
    const uri = it.uri ? it.uri.replace(/^https?:\/\/(dx\.)?doi\.org\//, "https://doi.org/") : `https://doi.org/10.13039/${it.id}`;
    hits.push({ id: it.id, name: it.name, uri, country: it.location });
  }
  return hits;
}
