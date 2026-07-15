import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site-url";

/**
 * robots.txt (ADR-0055 am.1). Allow the public, crawlable surfaces — study
 * records + listing (/browse), researcher profiles (/u), legal/security — and
 * disallow the authenticated app + auth + participant surfaces (they 302 to
 * /signin or hold no indexable value). Mirrors middleware.ts's protected list.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/browse", "/u", "/legal", "/security"],
        disallow: [
          "/studies",
          "/library",
          "/frameworks",
          "/saved",
          "/settings",
          "/admin",
          "/actions",
          "/api",
          "/preview",
          "/take",
          "/signin",
          "/signup",
          "/sso-callback",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
