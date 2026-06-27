"use server";

import { auth } from "@/server/adapters/auth";
import { isFeatureTipId } from "@/lib/feature-tips";

/**
 * Permanently dismiss a feature-discovery tooltip (platform-foundation PF3.3).
 * Appends the tip id to the user's `dismissedFeatureTips` in Clerk
 * publicMetadata (read-modify-write; Clerk shallow-merges the patch). Idempotent;
 * no-ops when signed out or given an unknown id.
 */
export async function dismissFeatureTip(tipId: string): Promise<void> {
  if (!isFeatureTipId(tipId)) return;
  const current = await auth.getCurrentUser();
  if (!current) return;
  const meta = await auth.getUserMetadata(current.id);
  const set = new Set(meta.dismissedFeatureTips ?? []);
  if (set.has(tipId)) return;
  set.add(tipId);
  await auth.setUserMetadata(current.id, { dismissedFeatureTips: [...set] });
}
