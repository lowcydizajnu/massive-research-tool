import { z } from "zod";

import { recordCookieConsent } from "@/server/legal/consent";

/**
 * Cookie-consent write (legal-baseline LG2). Public POST — works on every route
 * including pages without the tRPC provider (e.g. /legal, /security, signup).
 * The banner calls this on a choice; the row is the audit record (the live
 * show/hide is driven client-side by localStorage).
 */
const Body = z.object({
  choice: z.enum(["all", "necessary"]),
  cookiePolicyVersion: z.number().int().min(1),
  preSignupId: z.string().max(64).optional(),
});

export async function POST(req: Request): Promise<Response> {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  try {
    await recordCookieConsent(parsed);
    return Response.json({ ok: true });
  } catch {
    // Never block the participant/researcher on an audit-write failure.
    return Response.json({ ok: false, error: "write_failed" }, { status: 200 });
  }
}
