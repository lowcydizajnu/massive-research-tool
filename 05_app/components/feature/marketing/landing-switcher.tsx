import Link from "next/link";

/**
 * Floating A/B switcher for the two landing-page proposals (temporary, for the
 * owner to compare): "Minimal" = the v0.7 token-based build (`/`), "Bold" = the
 * Figma 3D-illustration direction (`/?style=bold`). Remove once a direction is
 * chosen. Fixed top-right; high z so it sits above both layouts.
 */
export function LandingSwitcher({ current }: { current: "minimal" | "bold" | "scenes" }) {
  const base = "rounded-full px-3 py-1 text-[13px] font-medium transition-colors";
  const on = "bg-[var(--color-primary)] text-white";
  const off = "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]";
  const opts: { label: string; href: string; key: "minimal" | "bold" | "scenes" }[] = [
    { label: "Minimal", href: "/", key: "minimal" },
    { label: "Bold", href: "/?style=bold", key: "bold" },
    { label: "Scenes", href: "/?style=scenes", key: "scenes" },
  ];
  return (
    <div className="fixed bottom-4 right-4 z-[90] flex items-center gap-1 rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-1 shadow-[var(--shadow-md)]">
      <span className="px-2 text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Proposal</span>
      {opts.map((o) => (
        <Link key={o.key} href={o.href as never} className={`${base} ${current === o.key ? on : off}`}>
          {o.label}
        </Link>
      ))}
    </div>
  );
}
