"use server";

import { redirect } from "next/navigation";

import { auth } from "@/server/adapters/auth";

/**
 * Sign the current user out (V1.12 A1). Revokes the session via the AuthAdapter
 * (never Clerk directly — ADR-0007) and redirects to `/`, which is auth-aware
 * and sends the now-unauthenticated user on to `/signup`.
 */
export async function signOutAction(): Promise<void> {
  await auth.signOut();
  redirect("/");
}
