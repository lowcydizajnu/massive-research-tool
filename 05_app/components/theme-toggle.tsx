"use client";

import { useTheme, type ThemeChoice } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

/**
 * Three-card theme picker — Light / Dark / System.
 * Matches the picker shown in 03_design/wireframes/signup-onboarding.md
 * and 03_design/wireframes/account-settings.md (Appearance tab).
 */

const OPTIONS: Array<{ choice: ThemeChoice; label: string }> = [
  { choice: "light", label: "Light" },
  { choice: "dark", label: "Dark" },
  { choice: "system", label: "System" },
];

export function ThemeToggle() {
  const { choice, setChoice } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme preference"
      className="grid grid-cols-3 gap-3"
    >
      {OPTIONS.map((option) => {
        const active = choice === option.choice;
        return (
          <button
            key={option.choice}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setChoice(option.choice)}
            className={cn(
              "group flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border p-3 text-left transition-[background,border]",
              active
                ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)]"
                : "border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] hover:bg-[var(--color-surface-subtle)]",
            )}
          >
            <ThemeSwatch choice={option.choice} />
            <span
              className={cn(
                "text-[length:var(--text-small)] font-medium",
                active
                  ? "text-[var(--color-primary-text-on-subtle)]"
                  : "text-[var(--color-text-primary)]",
              )}
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ThemeSwatch({ choice }: { choice: ThemeChoice }) {
  // Tiny mock of the surface — page bg behind a card. Helps the picker
  // communicate what the user is about to choose without a screenshot.
  if (choice === "light") {
    return (
      <div className="flex h-12 w-full items-center justify-center rounded-md bg-[#F7F2E8]">
        <div className="h-7 w-4/5 rounded-sm border border-[#E6DFD2] bg-white" />
      </div>
    );
  }
  if (choice === "dark") {
    return (
      <div className="flex h-12 w-full items-center justify-center rounded-md bg-[#161514]">
        <div className="h-7 w-4/5 rounded-sm border border-[#322E2A] bg-[#1F1D1B]" />
      </div>
    );
  }
  return (
    <div className="grid h-12 w-full grid-cols-2 overflow-hidden rounded-md">
      <div className="flex items-center justify-center bg-[#F7F2E8]">
        <div className="h-7 w-4/5 rounded-sm border border-[#E6DFD2] bg-white" />
      </div>
      <div className="flex items-center justify-center bg-[#161514]">
        <div className="h-7 w-4/5 rounded-sm border border-[#322E2A] bg-[#1F1D1B]" />
      </div>
    </div>
  );
}
