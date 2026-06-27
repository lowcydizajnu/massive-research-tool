import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Shared empty-state (platform-foundation PF3.2, ADR-0072 / empty-state-component
 * wireframe). One consistent "no content yet" treatment across destinations:
 * a soft `surface.subtle` card, optional icon, serif heading, body, and an
 * optional CTA that points at the obvious next step. Server-component-safe
 * (pure presentational — pass an interactive CTA as `action`).
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  align = "center",
  className,
}: {
  icon?: LucideIcon;
  title: string;
  body?: string;
  /** A CTA (button/link). Keep to one primary next step. */
  action?: React.ReactNode;
  align?: "center" | "start";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--color-surface-subtle)] p-10",
        align === "center" ? "items-center text-center" : "items-start",
        className,
      )}
    >
      {Icon ? <Icon className="size-8 text-[var(--color-text-muted)]" aria-hidden /> : null}
      <div className="flex flex-col gap-1">
        <p className="font-serif text-[length:var(--text-heading-2)] font-medium text-[var(--color-text-primary)]">
          {title}
        </p>
        {body ? (
          <p className="max-w-md text-[length:var(--text-body)] text-[var(--color-text-secondary)]">{body}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
