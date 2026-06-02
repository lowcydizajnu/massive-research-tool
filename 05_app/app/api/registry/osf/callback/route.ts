import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { registry } from "@/server/adapters/registry";
import { getCurrentDbUser } from "@/server/auth/current-db-user";

/**
 * OSF OAuth callback. Verifies the CSRF state against the cookie, exchanges the
 * code (RegistryAdapter.completeConnection stores encrypted tokens), then
 * redirects back to Account Settings · Connections with a status flag.
 */
function redirectUri(reqUrl: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(reqUrl).origin;
  return `${base}/api/registry/osf/callback`;
}

export async function GET(req: Request) {
  const dbUser = await getCurrentDbUser();
  if (!dbUser) return NextResponse.redirect(new URL("/signin", req.url));

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = (await cookies()).get("osf_oauth_state")?.value;

  const settings = new URL("/settings/account", req.url);

  if (!code || !state || !cookieState || state !== cookieState) {
    settings.searchParams.set("osf", "error");
    const res = NextResponse.redirect(settings);
    res.cookies.delete("osf_oauth_state");
    return res;
  }

  try {
    await registry.completeConnection({
      userId: dbUser.id,
      code,
      redirectUri: redirectUri(req.url),
    });
    settings.searchParams.set("osf", "connected");
  } catch {
    settings.searchParams.set("osf", "error");
  }

  const res = NextResponse.redirect(settings);
  res.cookies.delete("osf_oauth_state");
  return res;
}
