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
  return clean({
    "@context": "https://schema.org",
    "@type": type,
    name: d.title,
    description: abstract,
    url: recordUrl(d.studyId),
    datePublished: d.record?.publishedAt ?? d.createdAt,
    keywords: d.tags.length ? d.tags.join(", ") : undefined,
    license: licenseInfo(d.license).url ?? undefined,
    identifier,
    creativeWorkStatus: d.finishedAt ? "Published" : "Draft",
    isAccessibleForFree: true,
    author: clean({
      "@type": "Person",
      name: d.authorName || "Unknown",
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
