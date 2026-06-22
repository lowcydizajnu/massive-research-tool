import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/server/adapters/auth";
import { rateLimit } from "@/server/adapters/ratelimit";
import {
  EXTRACT_MAX_BYTES,
  classifyDocument,
  extractDocumentText,
} from "@/server/extract/document";

/**
 * Extract a researcher-uploaded PDF/Word document to plain text for the AI
 * conversation block's context (ADR-0061 / ADR-0062). Researcher-facing, so it
 * is auth-gated (any signed-in user — it reads no tenant data), rate-limited per
 * user, and size-capped over untrusted binary input. Returns only the extracted
 * text; the original file is never stored. Parsing libs are confined to
 * `server/extract/document.ts`.
 */
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = await auth.getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to upload." }, { status: 401 });

  const rl = await rateLimit.limit(`extract:${user.id}`, { max: 30, windowSeconds: 60 });
  if (!rl.allowed) return NextResponse.json({ error: "Too many uploads — try again shortly." }, { status: 429 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file." }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  if (file.size > EXTRACT_MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 10 MB)." }, { status: 413 });
  }
  if (!classifyDocument(file.name, file.type)) {
    return NextResponse.json({ error: "Unsupported file type. Use PDF, Word (.docx), or a text file." }, { status: 415 });
  }

  try {
    const bytes = await file.arrayBuffer();
    const { text, chars, truncated } = await extractDocumentText(bytes, file.name, file.type);
    return NextResponse.json({ text, name: file.name, chars, truncated });
  } catch (e) {
    const reason = e instanceof Error ? e.message : "";
    if (reason === "empty") {
      return NextResponse.json(
        { error: "No text found — this looks like a scanned PDF or image. Paste the text instead." },
        { status: 422 },
      );
    }
    if (reason === "unsupported") {
      return NextResponse.json({ error: "Unsupported file type." }, { status: 415 });
    }
    return NextResponse.json({ error: "Couldn’t read that document. Try a different file or paste the text." }, { status: 422 });
  }
}
