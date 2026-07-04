import { PageSkeleton } from "@/components/ui/skeleton";

/**
 * Dashboard navigation skeleton — the common landing after a workspace switch,
 * so it gets a KPI row + widget grid to match its real shape (the switch itself
 * feels much faster since compute moved to fra1, ADR-0093; this covers the
 * remaining server-render window).
 */
export default function DashboardLoading() {
  return <PageSkeleton kpis cards={6} />;
}
