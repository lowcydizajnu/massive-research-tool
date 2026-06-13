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
  // Anti-XSS (ADR-0003 am.): untrusted participant uploads (resp/) are served
  // as a download UNLESS they're a raster image we can safely render inline
  // (signature PNGs, picture answers) — never svg/html. Researcher assets (ws/,
  // authenticated uploader) stay inline. Disposition is signed into the URL.
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  const inlineSafe =
    !key.startsWith("resp/") || ["png", "jpg", "jpeg", "webp", "gif"].includes(ext);
  const url = await storage.presignDownload(key, 3600, inlineSafe ? "inline" : "attachment");
  return NextResponse.redirect(url, { status: 302 });
}
