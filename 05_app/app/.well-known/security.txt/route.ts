/**
 * security.txt (ADR-0072 PF1.3) — RFC 9116 machine-readable security contact.
 * Served at /.well-known/security.txt (public; the middleware doesn't gate it).
 * Bump `Expires` yearly. Mirrors the human-readable /security page.
 */
const SITE = "https://myresearchlab.app";

export function GET(): Response {
  const body = [
    `Contact: mailto:security@myresearchlab.app`,
    `Expires: 2027-06-26T00:00:00.000Z`,
    `Preferred-Languages: en`,
    `Canonical: ${SITE}/.well-known/security.txt`,
    `Policy: ${SITE}/security`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // Cache at the edge for a day — this changes ~yearly.
      "cache-control": "public, max-age=86400",
    },
  });
}
