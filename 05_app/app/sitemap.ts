import type { MetadataRoute } from "next";

import { profileUrl, recordUrl, SITE_URL } from "@/lib/site-url";
import { getServerApi } from "@/server/trpc/server";

/**
 * sitemap.xml (ADR-0055 am.1). Lists the public, crawlable surfaces — every
 * public study record + every opted-in researcher profile — from two public
 * tRPC procedures that reuse the app's visibility rules. Dynamic: it queries the
 * DB per request, so it must not be statically prerendered at build.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const api = await getServerApi();
  const [studies, handles] = await Promise.all([
    api.studies.publicSitemap().catch(() => []),
    api.profile.publicHandles().catch(() => []),
  ]);
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/browse`, changeFrequency: "daily", priority: 0.9 },
    ...studies.map((s) => ({
      url: recordUrl(s.studyId),
      lastModified: s.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...handles.map((h) => ({
      url: profileUrl(h.handle),
      lastModified: h.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
