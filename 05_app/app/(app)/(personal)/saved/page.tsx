import { SavedList } from "@/components/feature/study-record/saved-list";

/**
 * The "Saved" destination (ADR-0056, item 4) — the caller's private reading
 * list. The list + tabs are interactive (client), so this RSC shell just mounts
 * the component; data loads through the tRPC client (saved.list).
 */
export const dynamic = "force-dynamic";

export default function SavedPage() {
  return <SavedList />;
}
