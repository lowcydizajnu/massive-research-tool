import { NextResponse, type NextRequest } from "next/server";

import { recordNotificationAction } from "@/server/runtime/participant";
import { allowAnswer } from "@/server/runtime/take-rate-limit";

/**
 * Out-of-band record of a persistent notification's action (ADR-0097). The
 * persistent host beacons here when a `scope: "persist"` notice is dismissed /
 * clicked on a screen LATER than its anchor, where the per-screen form has no
 * field for it. Anonymous like the rest of `/take/*` and scoped exactly as
 * answers are — the same per-response rate limit, and the server only writes for
 * a persist-notification block that actually exists in the response's snapshot
 * (any other target is a silent no-op). sendBeacon ignores the response body.
 */
export async function POST(req: NextRequest) {
  let body: { responseId?: unknown; blockInstanceId?: unknown; action?: unknown; atMs?: unknown; screen?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const responseId = typeof body.responseId === "string" ? body.responseId : "";
  const blockInstanceId = typeof body.blockInstanceId === "string" ? body.blockInstanceId : "";
  const action = typeof body.action === "string" ? body.action : "";
  if (!responseId || !blockInstanceId || !action) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!(await allowAnswer(responseId))) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const res = await recordNotificationAction({
    responseId,
    blockInstanceId,
    action,
    atMs: typeof body.atMs === "number" ? body.atMs : 0,
    screen: typeof body.screen === "number" ? body.screen : 1,
  });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 400 });
}
