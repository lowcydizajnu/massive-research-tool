import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { registry } from "@/server/adapters/registry";
import { getCurrentDbUser } from "@/server/auth/current-db-user";

/**
 * OSF OAuth callback (matches the registered OSF_OAUTH_REDIRECT_URI). Verifies
 * the CSRF state cookie, exchanges the code (RegistryAdapter stores encrypted
 * tokens), then redirects to Account Settings · Connections with a status flag.
 */
export async function GET(req: Request) {
  const dbUser = await getCurrentDbUser();
  if (!dbUser) return NextResponse.redirect(new URL("/signin", req.url));

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = (await cookies()).get("osf_oauth_state")?.value;

  const settings = new URL("/settings/account", req.url);
  // Land on the Connections tab so the success/error banner actually renders —
  // it only shows under tab=connections; otherwise the user lands on Profile and
  // sees nothing ("logged in but still asks for a token").
  settings.searchParams.set("tab", "connections");

  if (!code || !state || !cookieState || state !== cookieState) {
    settings.searchParams.set("osf", "error");
    const res = NextResponse.redirect(settings);
    res.cookies.delete("osf_oauth_state");
    return res;
  }

  try {
    await registry.completeConnection({ userId: dbUser.id, code });
    settings.searchParams.set("osf", "connected");
  } catch {
    settings.searchParams.set("osf", "error");
  }

  const res = NextResponse.redirect(settings);
  res.cookies.delete("osf_oauth_state");
  return res;
}
