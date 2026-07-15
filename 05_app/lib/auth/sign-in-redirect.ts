import type { Route } from "next";

/**
 * The /signin URL that returns the user to where they are now (GitHub-model,
 * ADR-0055 am.1). Public surfaces render the action buttons for anonymous
 * visitors; clicking one routes here so they sign in and come back to the same
 * record. Mirrors the exact `redirect_url` shape middleware.ts uses for gated
 * routes. Call ONLY from a click handler (reads window.location, always defined
 * at click time) — never during render/SSR.
 */
export function signInHref(): Route {
  const here =
    typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
  return `/signin?redirect_url=${encodeURIComponent(here)}` as Route;
}
