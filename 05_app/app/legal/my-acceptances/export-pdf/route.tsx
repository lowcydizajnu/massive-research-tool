import { renderToBuffer } from "@react-pdf/renderer";
import { desc, eq } from "drizzle-orm";

import { AcceptancesPdfDocument, type AcceptancesPdfData } from "@/components/feature/legal/acceptances-pdf";
import { db } from "@/server/db/client";
import { legalAcceptance } from "@/server/db/schema";
import { getCurrentDbUser } from "@/server/auth/current-db-user";
import { CURRENT_LEGAL_VERSION, LEGAL_TITLES, isLegalKind } from "@/lib/legal/content";

// @react-pdf/renderer is Node-only (ADR-0027) — never the edge runtime.
export const runtime = "nodejs";

/**
 * GET /legal/my-acceptances/export-pdf — a PDF receipt of the current user's
 * legal acceptances (legal-baseline LG4). Auth is the resolved DB user; an
 * unauthenticated request gets 401 (the page itself redirects to /signin).
 */
export async function GET() {
  const dbUser = await getCurrentDbUser();
  if (!dbUser) return new Response("Unauthorized", { status: 401 });

  const rows = await db
    .select({
      kind: legalAcceptance.documentKind,
      version: legalAcceptance.documentVersion,
      acceptedAt: legalAcceptance.acceptedAt,
    })
    .from(legalAcceptance)
    .where(eq(legalAcceptance.userId, dbUser.id))
    .orderBy(desc(legalAcceptance.acceptedAt));

  const fmt = (d: Date) => new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const data: AcceptancesPdfData = {
    email: dbUser.email,
    displayName: dbUser.displayName || dbUser.email,
    generatedOn: fmt(new Date()),
    rows: rows.map((r) => ({
      title: isLegalKind(r.kind) ? LEGAL_TITLES[r.kind] : r.kind,
      version: r.version,
      acceptedOn: fmt(r.acceptedAt),
      inForce: isLegalKind(r.kind) && r.version === CURRENT_LEGAL_VERSION[r.kind],
    })),
  };

  const buffer = await renderToBuffer(<AcceptancesPdfDocument data={data} />);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'attachment; filename="legal-acceptances.pdf"',
      "cache-control": "no-store",
    },
  });
}
