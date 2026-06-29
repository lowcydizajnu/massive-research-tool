import Link from "next/link";

/**
 * Floating A/B switcher for the two landing-page proposals (temporary, for the
 * owner to compare): "Minimal" = the v0.7 token-based build (`/`), "Bold" = the
 * Figma 3D-illustration direction (`/?style=bold`). Remove once a direction is
 * chosen. Fixed top-right; high z so it sits above both layouts.
 */
export function LandingSwitcher({ current }: { current: "minimal" | "bold" }) {
  const base = "rounded-full px-3 py-1 text-[13px] font-medium transition-colors";
  const on = "bg-[var(--color-primary)] text-white";
  const off = "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]";
  return (
    <div className="fixed right-4 top-4 z-[90] flex items-center gap-1 rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-1 shadow-[var(--shadow-md)]">
      <span className="px-2 text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Proposal</span>
      <Link href="/" className={`${base} ${current === "minimal" ? on : off}`}>
        Minimal
      </Link>
      <Link href="/?style=bold" className={`${base} ${current === "bold" ? on : off}`}>
        Bold
      </Link>
    </div>
  );
}
