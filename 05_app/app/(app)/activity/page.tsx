import { ActivityFeed } from "@/components/feature/activity/activity-feed";

/**
 * Activity destination (activity-destination.md) — Yours / Follows. The stream
 * is interactive (tab switch + mark-read), so the page is a thin shell around
 * the client ActivityFeed, which reads via the tRPC React client.
 */
export default function ActivityPage() {
  return <ActivityFeed />;
}
