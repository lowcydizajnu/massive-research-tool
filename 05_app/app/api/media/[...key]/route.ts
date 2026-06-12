import { NextResponse, type NextRequest } from "next/server";

import { isSafeMediaKey } from "@/lib/uploads";
import { storage } from "@/server/adapters/storage";

/**
 * Public media gateway (ADR-0003): /api/media/<key> 302-redirects to a
 * short-lived presigned R2 GET. The bucket stays private; participants and the
 * Builder both load assets through this stable URL. Keys are namespace-checked
 * (ws/ researcher uploads, resp/ participant recordings) — nothing else serves.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await ctx.params;
  const key = (parts ?? []).join("/");
  if (!isSafeMediaKey(key)) return new NextResponse("Not found", { status: 404 });
  if (!storage.configured()) return new NextResponse("Storage not configured", { status: 503 });
  const url = await storage.presignDownload(key);
  return NextResponse.redirect(url, { status: 302 });
}
