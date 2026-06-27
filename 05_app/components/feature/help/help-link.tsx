import { CircleHelp } from "lucide-react";

import { docUrl, type HelpDocKey } from "@/lib/help/doc-urls";
import { cn } from "@/lib/utils";

/**
 * Contextual docs link (EE4, ADR-0078; help-link-component.md). Drop next to a
 * feature heading or control: `<HelpLink docKey="builder.conditions" />`. Opens
 * the mapped docs page in a new tab. `docKey` is typed, so a bad/removed link is
 * a compile error. Icon-only by default; pass `label` inside dense panels.
 */
export function HelpLink({
  docKey,
  label,
  className,
}: {
  docKey: HelpDocKey;
  label?: string;
  className?: string;
}) {
  const accessibleName = label ? `Learn more: ${label}` : "Learn more";
  return (
    <a
      href={docUrl(docKey)}
      target="_blank"
      rel="noopener noreferrer"
      title={label ?? "Learn more"}
      aria-label={`${accessibleName} (opens docs in a new tab)`}
      className={cn(
        "inline-flex items-center gap-1 align-middle text-[length:var(--text-small)] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]",
        className,
      )}
    >
      <CircleHelp className="size-4 shrink-0" aria-hidden />
      {label ? <span>{label}</span> : null}
    </a>
  );
}
