import { renderToBuffer } from "@react-pdf/renderer";

import { StudyPdfDocument } from "@/components/feature/overview/study-pdf";
import { buildStudyPdfData } from "@/server/study/pdf-data";

// @react-pdf/renderer is Node-only (ADR-0027) — never the edge runtime.
export const runtime = "nodejs";

function safeFilename(title: string): string {
  return (title || "study").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "study";
}

/**
 * GET /studies/[id]/export-pdf — generate the study document as a real PDF
 * (V1.12 B2, ADR-0027). Auth + workspace scoping ride on `studies.get` (404s
 * for non-members), gathered by the shared `buildStudyPdfData` (also used by the
 * OSF materials `protocol.pdf`, ADR-0094). Renders @react-pdf to a buffer.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let data: Awaited<ReturnType<typeof buildStudyPdfData>>;
  try {
    data = await buildStudyPdfData(id);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const buffer = await renderToBuffer(<StudyPdfDocument data={data} />);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeFilename(data.title)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
