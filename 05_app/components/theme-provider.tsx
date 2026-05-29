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

/**
 * Theme system per design-language brief v0.6 and ADR-0011.
 *
 * - "light" / "dark" — explicit user choice; ignores OS.
 * - "system" — follows prefers-color-scheme (the V1 default per signup-onboarding wireframe).
 *
 * Persistence: localStorage cache today; Clerk user metadata sync wires in
 * the auth iteration. The contract is the same — only the storage layer changes.
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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  // First paint — hydrate from storage + reflect OS
  useEffect(() => {
    const stored = readStoredChoice();
    setChoiceState(stored);
    setResolved(resolve(stored));
  }, []);

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
