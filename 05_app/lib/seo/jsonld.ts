import { licenseInfo } from "@/lib/licenses";
import { profileUrl, recordUrl, SITE_URL } from "@/lib/site-url";
import type { PublicStudyDetail } from "@/server/trpc/routers/studies";

/**
 * schema.org JSON-LD builders for the public, crawlable surfaces (ADR-0055 am.1).
 * Pure + server-safe; built ONLY from fields that exist. Emit via a
 * `<script type="application/ld+json">` in the RSC body (escape `<` before
 * dangerouslySetInnerHTML — see the pages). Drops null/undefined keys so the
 * output stays minimal + valid.
 */

/** Remove null/undefined (and empty arrays) so we never emit empty schema keys. */
function clean<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v === undefined || v === null || (Array.isArray(v) && v.length === 0)) delete o[k];
  }
  return o;
}

/**
 * DataCite 4.4 `resourceTypeGeneral`, derived from the record's state (ADR-0108,
 * LOS item ⑩). We don't mint a DataCite DOI (ADR-0104 — the OSF DOI is canonical),
 * so this is the correctly-typed metadata surfaced on the record + JSON-LD. The
 * vocabulary is DataCite's published controlled list, not invented — a published
 * dataset ranks first (Google Dataset Search), then a linked article, then the
 * preregistration itself.
 */
export function dataCiteResourceType(d: PublicStudyDetail): string {
  if (d.record?.dataTable) return "Dataset";
  if (d.record?.articleDoi) return "Text";
  if (d.registrationDoi || d.preregistrations.length) return "StudyRegistration";
  return "Text";
}

export function studyRecordJsonLd(d: PublicStudyDetail): Record<string, unknown> {
  const abstract = d.record?.abstract || d.overview.abstract || undefined;
  const articleDoi = d.record?.articleDoi ?? null;
  // A finished study with a published record / dataset is a Dataset; an
  // article-linked record is a ScholarlyArticle; otherwise a CreativeWork
  // (don't over-claim Dataset for an unfinished plan — Google Dataset Search).
  const type = d.record?.dataTable ? "Dataset" : articleDoi ? "ScholarlyArticle" : "CreativeWork";
  const identifier = d.registrationDoi
    ? `https://doi.org/${d.registrationDoi}`
    : articleDoi
      ? `https://doi.org/${articleDoi}`
      : undefined;
  // Funders → schema.org Organization, carrying the Crossref Funder Registry DOI
  // as @id when known (LOS item ⑩). Free-text funders keep just a name.
  const funder = d.funders.map((f) =>
    clean({ "@type": "Organization", name: f.name, "@id": f.uri || undefined }),
  );
  // Author affiliation with its ROR id as @id (LOS item ⑩ — the machine anchor
  // for the byline institution).
  const affiliation = d.authorAffiliation
    ? clean({ "@type": "Organization", name: d.authorAffiliation, "@id": d.authorRor || undefined })
    : undefined;
  return clean({
    "@context": "https://schema.org",
    "@type": type,
    name: d.title,
    description: abstract,
    url: recordUrl(d.studyId),
    datePublished: d.record?.publishedAt ?? d.createdAt,
    keywords: d.tags.length ? d.tags.join(", ") : undefined,
    inLanguage: d.language ?? undefined,
    license: licenseInfo(d.license).url ?? undefined,
    identifier,
    additionalType: dataCiteResourceType(d),
    creativeWorkStatus: d.finishedAt ? "Published" : "Draft",
    isAccessibleForFree: true,
    funder: funder.length ? funder : undefined,
    author: clean({
      "@type": "Person",
      name: d.authorName || "Unknown",
      affiliation,
      ...(d.authorOrcid
        ? {
            sameAs: `https://orcid.org/${d.authorOrcid}`,
            identifier: { "@type": "PropertyValue", propertyID: "ORCID", value: `https://orcid.org/${d.authorOrcid}` },
          }
        : {}),
    }),
    publisher: { "@type": "Organization", name: "My Research Lab", url: SITE_URL },
  });
}

export type ProfileForJsonLd = {
  handle: string | null;
  displayName: string;
  fullName: string | null;
  bio: string | null;
  affiliation: string | null;
  orcid: string | null;
  researchAreas: string[] | null;
  websiteUrl: string | null;
  scholarUrl: string | null;
  avatarUrl: string | null;
  publicAvatarR2Key: string | null;
};

export function profileJsonLd(p: ProfileForJsonLd): Record<string, unknown> {
  const image = p.publicAvatarR2Key ? `${SITE_URL}/api/media/${p.publicAvatarR2Key}` : p.avatarUrl || undefined;
  const sameAs = [
    p.orcid ? `https://orcid.org/${p.orcid}` : null,
    p.websiteUrl,
    p.scholarUrl,
  ].filter((x): x is string => !!x);
  return clean({
    "@context": "https://schema.org",
    "@type": "Person",
    name: p.fullName || p.displayName,
    alternateName: p.fullName && p.fullName !== p.displayName ? p.displayName : undefined,
    url: p.handle ? profileUrl(p.handle) : undefined,
    description: p.bio ?? undefined,
    knowsAbout: p.researchAreas && p.researchAreas.length ? p.researchAreas : undefined,
    affiliation: p.affiliation ? { "@type": "Organization", name: p.affiliation } : undefined,
    image,
    sameAs: sameAs.length ? sameAs : undefined,
  });
}
