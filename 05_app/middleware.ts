/**
 * Clerk middleware — route protection.
 *
 * Deliberate lock-in exception (ADR-0007, recorded in lock-in-inventory.md):
 * Next.js middleware must live at the project root and clerkMiddleware can't
 * sit behind the server-only AuthAdapter. Removed on an auth-vendor migration
 * (Better Auth ships its own middleware).
 *
 * Route-group folders like `(app)` are NOT part of the URL, so the matcher
 * targets real authenticated paths (e.g. /studies). The signup / sign-in
 * routes are deliberately left public. Today no protected routes exist yet —
 * this is forward-looking so the first authenticated surface is covered the
 * moment it lands.
 */
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/studies(.*)",
  "/library(.*)",
  "/frameworks(.*)",
  // /browse (listing + record detail) is PUBLIC + crawlable — GitHub-model,
  // ADR-0055 am.1. It lives in the app/(public) group (no auth shell) and its
  // actions bounce anon to /signin on click.
  "/saved(.*)",
  "/settings(.*)",
  "/admin(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isProtectedRoute(req)) return;
  const { userId } = await auth();
  if (!userId) {
    // Redirect to our own sign-in (not Clerk's hosted page). auth.protect()
    // would target the Account Portal; we own the auth surface (ADR-0007).
    const signIn = new URL("/signin", req.url);
    signIn.searchParams.set("redirect_url", req.url);
    return NextResponse.redirect(signIn);
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API/trpc routes.
    "/(api|trpc)(.*)",
  ],
};
