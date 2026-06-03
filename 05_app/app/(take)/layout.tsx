/**
 * Participant runtime shell (participant-runtime.md, ADR-0013). A dedicated,
 * minimal shell — NOT the researcher chrome (no left rail, top bar, tRPC, or
 * Clerk dependency). A centered column on parchment; each /take screen renders
 * its own card inside. Server-rendered MPA so analytics/heatmap tools work and
 * answers persist on every navigation.
 */
export default function TakeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen justify-center bg-[var(--color-surface-page)] px-4 py-10">
      <main className="w-full max-w-[640px]">{children}</main>
    </div>
  );
}
