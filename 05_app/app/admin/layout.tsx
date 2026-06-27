import { notFound } from "next/navigation";

import { AdminNav } from "@/components/feature/admin/admin-nav";
import { TRPCReactProvider } from "@/lib/trpc/react";
import { getCurrentDbUser } from "@/server/auth/current-db-user";
import { isAdminUser } from "@/server/admin/is-admin";

/**
 * Admin shell (ADR-0075). Centralizes the owner-only gate + the section nav for
 * all /admin/* pages. /admin sits OUTSIDE the (app) route group, so it needs its
 * own TRPCReactProvider — admin client components (e.g. the announcement form)
 * use the tRPC React hooks. The full Admin destination lands with the Analytics
 * + Admin handoff. Non-admins get a 404 — the routes must not reveal they exist.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const dbUser = await getCurrentDbUser();
  if (!isAdminUser(dbUser)) notFound();

  return (
    <TRPCReactProvider>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-6 py-8">
        <div className="flex flex-col gap-3 border-b border-[var(--color-border-subtle)] pb-3">
          <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
            Admin
          </span>
          <AdminNav />
        </div>
        {children}
      </div>
    </TRPCReactProvider>
  );
}
