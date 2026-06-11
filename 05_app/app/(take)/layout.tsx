/**
 * Participant runtime shell (participant-runtime.md, ADR-0013). A dedicated,
 * minimal shell — NOT the researcher chrome (no left rail, top bar, tRPC, or
 * Clerk dependency). A centered column on parchment; each /take screen renders
 * its own card inside. Server-rendered MPA so analytics/heatmap tools work and
 * answers persist on every navigation.
 */
export default function TakeLayout({ children }: { children: React.ReactNode }) {
  // The per-study themed shell (take/[studyId]/layout.tsx, ADR-0024) owns the
  // page background, width, and CSS-variable overrides.
  return <>{children}</>;
}
