import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { registry } from "@/server/adapters/registry";
import { getCurrentDbUser } from "@/server/auth/current-db-user";

/**
 * Start the OSF OAuth flow. Mints a CSRF `state`, stores it in an httpOnly
 * cookie, and redirects to OSF's authorize URL (built by the RegistryAdapter
 * using the configured OSF_OAUTH_REDIRECT_URI — which must match the OSF app).
 */
export async function GET(req: Request) {
  const dbUser = await getCurrentDbUser();
  if (!dbUser) return NextResponse.redirect(new URL("/signin", req.url));

  const state = randomBytes(16).toString("hex");
  const authorizeUrl = registry.getAuthorizeUrl({ userId: dbUser.id, state });

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set("osf_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
