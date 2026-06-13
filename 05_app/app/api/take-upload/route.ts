import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { ulid } from "ulid";

import { db } from "@/server/db/client";
import { response } from "@/server/db/schema";
import { storage } from "@/server/adapters/storage";
import { allowAnswer } from "@/server/runtime/take-rate-limit";
import { UPLOAD_KINDS, validateUpload, type UploadKind } from "@/lib/uploads";

/**
 * Participant audio-upload presign (ADR-0003 + ADR-0013): the /take surface is
 * anonymous, so this is scoped the same way answers are — the responseId must
 * resolve to an existing response, and it counts against the same per-response
 * rate limit as answers. Keys live under resp/<responseId>/ and the signed
 * Content-Type pins exactly what was validated.
 */
export async function POST(req: NextRequest) {
  let body: { responseId?: string; contentType?: string; sizeBytes?: number; kind?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const { responseId, contentType, sizeBytes } = body;
  const kind: UploadKind = body.kind && body.kind in UPLOAD_KINDS ? (body.kind as UploadKind) : "audio";
  if (typeof responseId !== "string" || typeof contentType !== "string" || typeof sizeBytes !== "number") {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!(await allowAnswer(responseId))) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const [resp] = await db.select({ id: response.id }).from(response).where(eq(response.id, responseId)).limit(1);
  if (!resp) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!storage.configured()) {
    return NextResponse.json({ error: "Recording storage isn’t configured on this server." }, { status: 503 });
  }
  const v = validateUpload(kind, contentType, sizeBytes);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const key = `resp/${responseId}/${ulid()}.${v.ext}`;
  const uploadUrl = await storage.presignUpload(key, contentType);
  return NextResponse.json({ uploadUrl, key });
}
