import { NextResponse, type NextRequest } from "next/server";

import { isSafeMediaKey } from "@/lib/uploads";
import { auth } from "@/server/adapters/auth";
import { storage } from "@/server/adapters/storage";
import { authorizeMediaKey, dbMediaAuthDeps } from "@/server/media/authorize";

/**
 * Media gateway (ADR-0003): /api/media/<key> 302-redirects to a short-lived
 * presigned R2 GET. The bucket stays private; assets load through this stable URL.
 * `ws/` researcher stimuli are public (participants load them un-authed); `resp/`
 * participant uploads (PII) require an active member of the owning workspace
 * (ADR-0003 amendment 2026-06-14).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await ctx.params;
  const key = (parts ?? []).join("/");
  if (!isSafeMediaKey(key)) return new NextResponse("Not found", { status: 404 });
  if (!storage.configured()) return new NextResponse("Storage not configured", { status: 503 });

  // Access control: branch on the key prefix BEFORE any auth/DB work so `ws/`
  // stimulus loads stay public + zero-cost; only `resp/` keys resolve identity.
  const externalUserId = key.startsWith("resp/") ? ((await auth.getCurrentUser())?.id ?? null) : null;
  const authz = await authorizeMediaKey(key, externalUserId, dbMediaAuthDeps);
  if (!authz.ok) {
    return new NextResponse(authz.status === 403 ? "Forbidden" : "Not found", { status: authz.status });
  }

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
