"use server";

import { revalidatePath } from "next/cache";

import { registry } from "@/server/adapters/registry";
import { getCurrentDbUser } from "@/server/auth/current-db-user";

/** Disconnect the current user's OSF connection (Account Settings · Connections). */
export async function disconnectOsfAction(): Promise<void> {
  const dbUser = await getCurrentDbUser();
  if (!dbUser) throw new Error("Not authenticated");
  await registry.disconnect(dbUser.id);
  revalidatePath("/settings/account");
}
