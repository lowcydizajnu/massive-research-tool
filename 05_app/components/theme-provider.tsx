"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { persistThemeChoice } from "@/app/actions/set-theme";

/**
 * Theme system per design-language brief v0.6 and ADR-0011.
 *
 * - "light" / "dark" — explicit user choice; ignores OS.
 * - "system" — follows prefers-color-scheme (the V1 default per signup-onboarding wireframe).
 *
 * Persistence (two layers, same contract):
 *   - localStorage — instant first paint + the source for signed-out users.
 *   - Clerk publicMetadata — durable, written via the `persistThemeChoice`
 *     server action (which goes through the AuthAdapter, so this component
 *     never imports Clerk). No-ops when signed out.
 *
 * `initialChoice` lets a server component seed the choice from the user's
 * stored metadata; when omitted, localStorage drives first paint.
 */

export type ThemeChoice = "light" | "dark" | "system";

const STORAGE_KEY = "mrt-theme";

type ThemeContextValue = {
  /** What the user picked. "system" follows the OS. */
  choice: ThemeChoice;
  /** What's actually rendered right now ("light" or "dark"). */
  resolved: "light" | "dark";
  setChoice: (choice: ThemeChoice) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function readStoredChoice(): ThemeChoice {
  if (typeof window === "undefined") return "system";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

function osPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(choice: ThemeChoice): "light" | "dark" {
  if (choice === "system") return osPrefersDark() ? "dark" : "light";
  return choice;
}

export function ThemeProvider({
  children,
  initialChoice,
}: {
  children: ReactNode;
  initialChoice?: ThemeChoice;
}) {
  const [choice, setChoiceState] = useState<ThemeChoice>(
    initialChoice ?? "system",
  );
  const [resolved, setResolved] = useState<"light" | "dark">(
    initialChoice ? resolve(initialChoice) : "light",
  );

  // First paint — hydrate from storage (or honor the server-provided choice) + reflect OS
  useEffect(() => {
    const stored = initialChoice ?? readStoredChoice();
    setChoiceState(stored);
    setResolved(resolve(stored));
  }, [initialChoice]);

  // Reflect resolution onto <html data-theme="…">
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  // If choice === "system", listen for OS changes
  useEffect(() => {
    if (choice !== "system" || typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      setResolved(e.matches ? "dark" : "light");
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [choice]);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    setResolved(resolve(next));
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
    // Durable write for signed-in users; no-ops otherwise. Fire-and-forget so
    // the UI never waits on the network to switch.
    void persistThemeChoice(next).catch(() => {
      /* offline / signed-out — localStorage already holds the choice */
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ choice, resolved, setChoice }),
    [choice, resolved, setChoice],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return ctx;
}
