"use server";

import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getCurrentDbUser } from "@/server/auth/current-db-user";
import { db } from "@/server/db/client";
import { member } from "@/server/db/schema";
import { ACTIVE_WORKSPACE_COOKIE } from "@/server/workspace/active";

/**
 * Set the active workspace (workspace switcher, ADR-0033) and land on it.
 * Writes the selection to an httpOnly cookie (read per-request in createContext,
 * honored by resolveActiveWorkspace) — no migration, no per-request Clerk call.
 * Membership is validated before the selection is honored. Lands on /studies for
 * now; flips to /dashboard once the workspace dashboard ships (Stream B).
 */
export async function switchWorkspaceAction(workspaceId: string): Promise<void> {
  const dbUser = await getCurrentDbUser();
  if (!dbUser) redirect("/signin");

  const [m] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.userId, dbUser.id),
        eq(member.workspaceId, workspaceId),
        eq(member.status, "active"),
      ),
    )
    .limit(1);
  if (!m) redirect("/"); // stale / not a member → the auth-aware root landing

  await setActiveCookie(workspaceId);
  redirect("/studies");
}

/**
 * Open a study from the cross-workspace Home (ADR-0033): switch the active
 * workspace to the study's workspace, then land on the requested stage. The
 * study page is itself workspace-scoped, so a mismatched id 404s safely.
 */
export async function openStudyAction(
  workspaceId: string,
  studyId: string,
  stage: "build" | "run",
): Promise<void> {
  const dbUser = await getCurrentDbUser();
  if (!dbUser) redirect("/signin");
  const [m] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.userId, dbUser.id),
        eq(member.workspaceId, workspaceId),
        eq(member.status, "active"),
      ),
    )
    .limit(1);
  if (!m) redirect("/");
  await setActiveCookie(workspaceId);
  redirect(`/studies/${studyId}/${stage}`);
}

async function setActiveCookie(workspaceId: string): Promise<void> {
  const store = await cookies();
  store.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
}
