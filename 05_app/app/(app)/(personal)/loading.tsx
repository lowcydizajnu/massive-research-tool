import { PageSkeleton } from "@/components/ui/skeleton";

/**
 * Instant navigation skeleton shared by the personal sections (Home, Browse,
 * Saved, Settings, Memberships). Personal-mode chrome persists; this fills the
 * content area immediately while the force-dynamic page renders.
 */
export default function PersonalSectionLoading() {
  return <PageSkeleton />;
}
