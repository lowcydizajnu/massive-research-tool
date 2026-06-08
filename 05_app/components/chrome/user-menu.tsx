"use client";

import { useClerk } from "@clerk/nextjs";
import { LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * Account menu in the TopBar (V1.12 A1). Avatar button → dropdown with the
 * user's identity, a link to Account settings, and a working Sign out (posts to
 * the `signOutAction` server action → AuthAdapter revoke → `/`). ESC / outside
 * click closes it.
 */
export function UserMenu({
  initials,
  displayName,
  email,
}: {
  initials: string;
  displayName: string | null;
  email: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { signOut } = useClerk();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemCls =
    "flex w-full items-center gap-2 px-3 py-2 text-left text-[length:var(--text-body)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-subtle)]";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex size-8 items-center justify-center rounded-full bg-[var(--color-primary-subtle)] text-[length:var(--text-small)] font-medium text-[var(--color-primary-text-on-subtle)] hover:opacity-90"
      >
        {initials}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full z-50 mt-1 w-60 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] py-1"
          style={{ boxShadow: "var(--shadow-md)" }}
        >
          <div className="border-b border-[var(--color-border-subtle)] px-3 py-2">
            <div className="truncate text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
              {displayName || "Your account"}
            </div>
            {email ? (
              <div className="truncate text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                {email}
              </div>
            ) : null}
          </div>

          <Link href="/settings/account" role="menuitem" className={itemCls} onClick={() => setOpen(false)}>
            <Settings className="size-4 text-[var(--color-text-muted)]" aria-hidden />
            Account settings
          </Link>

          <button
            type="button"
            role="menuitem"
            disabled={signingOut}
            onClick={() => {
              setSigningOut(true);
              // Clerk's client signOut clears the session + cookies, then
              // redirects to the auth-aware root (→ /signup when signed out).
              void signOut({ redirectUrl: "/" });
            }}
            className={itemCls}
          >
            <LogOut className="size-4 text-[var(--color-text-muted)]" aria-hidden />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
