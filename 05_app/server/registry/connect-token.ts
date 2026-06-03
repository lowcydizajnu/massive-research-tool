"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { registry } from "@/server/adapters/registry";
import { getCurrentDbUser } from "@/server/auth/current-db-user";

/**
 * Connect OSF with a pasted Personal Access Token (Account Settings ·
 * Connections). The token is validated + stored encrypted by the adapter; we
 * only translate success/failure into a redirect flag the page renders. See
 * ADR-0005 (PAT amendment).
 */
export async function connectOsfTokenAction(formData: FormData): Promise<void> {
  const dbUser = await getCurrentDbUser();
  if (!dbUser) redirect("/signin");

  const token = String(formData.get("token") ?? "");
  try {
    await registry.connectWithToken({ userId: dbUser.id, token });
  } catch {
    // Don't leak the token or adapter internals into the URL; the page shows a
    // generic "couldn't connect" message.
    redirect("/settings/account?osf=error");
  }
  // Bust the RSC cache so the card re-renders in its connected state (otherwise
  // the success banner shows over a stale "paste a token" form).
  revalidatePath("/settings/account");
  redirect("/settings/account?osf=connected");
}
