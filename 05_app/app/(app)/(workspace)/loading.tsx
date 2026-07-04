import { PageSkeleton } from "@/components/ui/skeleton";

/**
 * Instant navigation skeleton shared by every workspace section (Studies,
 * Explore, Activity, Participants, Team, Library, Playground). These pages are
 * `force-dynamic`, so without a Suspense fallback a rail click showed the old
 * section frozen until the server render finished. The shared workspace layout
 * (rail + top bar) stays; this skeleton fills the content area immediately.
 * The dashboard has its own KPI-shaped skeleton (`dashboard/loading.tsx`).
 */
export default function WorkspaceSectionLoading() {
  return <PageSkeleton />;
}
