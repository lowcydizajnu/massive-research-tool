import { NextResponse } from "next/server";

/**
 * Health probe (ADR-0016). `scripts/deploy-verify.ts` GETs this after a deploy
 * to confirm the app booted and is serving the expected commit. Returns the
 * short git SHA Vercel injects (VERCEL_GIT_COMMIT_SHA) so verify can assert the
 * live deploy matches the commit it expects. No DB/auth touch — a pure liveness
 * + version signal that always answers fast.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
  });
}
