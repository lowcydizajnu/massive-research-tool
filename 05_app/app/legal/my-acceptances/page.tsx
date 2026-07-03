import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { legalAcceptance } from "@/server/db/schema";
import { getCurrentDbUser } from "@/server/auth/current-db-user";
import { CURRENT_LEGAL_VERSION, LEGAL_TITLES, isLegalKind } from "@/lib/legal/content";

export const metadata: Metadata = { title: "Your acceptances — My Research Lab" };

/**
 * Legal-baseline LG4 — /legal/my-acceptances. An authenticated audit trail of
 * the legal documents this researcher has accepted (kind + version + when),
 * with a per-row link to the exact version they accepted and a PDF receipt.
 *
 * A static segment, so it wins over the sibling /legal/[doc] dynamic route.
 * Lives outside the (app) shell (no workspace needed) — auth is enforced here
 * by resolving the current DB user; unauthenticated visitors go to /signin.
 */
export default async function MyAcceptancesPage() {
  const dbUser = await getCurrentDbUser();
  if (!dbUser) redirect("/signin");

  const rows = await db
    .select({
      kind: legalAcceptance.documentKind,
      version: legalAcceptance.documentVersion,
      acceptedAt: legalAcceptance.acceptedAt,
    })
    .from(legalAcceptance)
    .where(eq(legalAcceptance.userId, dbUser.id))
    .orderBy(desc(legalAcceptance.acceptedAt));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1 border-b border-[var(--color-border-subtle)] pb-4">
        <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
          Your acceptances
        </h1>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          A record of the legal documents you have accepted, for {dbUser.email}.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
          We have no acceptance records on file for your account yet.
        </p>
      ) : (
        <table className="w-full border-collapse text-[length:var(--text-body)]">
          <thead>
            <tr className="border-b border-[var(--color-border-subtle)] text-left text-[length:var(--text-small)] uppercase tracking-wide text-[var(--color-text-muted)]">
              <th className="py-2 pr-4 font-medium">Document</th>
              <th className="py-2 pr-4 font-medium">Version</th>
              <th className="py-2 pr-4 font-medium">Accepted</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const known = isLegalKind(r.kind);
              const title = isLegalKind(r.kind) ? LEGAL_TITLES[r.kind] : r.kind;
              const inForce = isLegalKind(r.kind) && r.version === CURRENT_LEGAL_VERSION[r.kind];
              const accepted = new Date(r.acceptedAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              });
              return (
                <tr key={`${r.kind}-${r.version}-${i}`} className="border-b border-[var(--color-border-subtle)]">
                  <td className="py-2 pr-4">
                    {known ? (
                      <Link
                        href={`/legal/${r.kind}?v=${r.version}` as Route}
                        className="text-[var(--color-primary)] hover:underline"
                      >
                        {title}
                      </Link>
                    ) : (
                      title
                    )}
                  </td>
                  <td className="py-2 pr-4 text-[var(--color-text-secondary)]">v{r.version}</td>
                  <td className="py-2 pr-4 text-[var(--color-text-secondary)]">{accepted}</td>
                  <td className="py-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                    {inForce ? "In force" : "Superseded"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <footer className="flex items-center gap-4 border-t border-[var(--color-border-subtle)] pt-4 text-[length:var(--text-small)]">
        {rows.length > 0 ? (
          <Link
            href={"/legal/my-acceptances/export-pdf" as Route}
            className="font-medium text-[var(--color-primary)] hover:underline"
          >
            Download PDF receipt
          </Link>
        ) : null}
        <Link className="text-[var(--color-primary)] hover:underline" href={"/legal/terms" as Route}>
          Terms
        </Link>
        <Link className="text-[var(--color-primary)] hover:underline" href={"/legal/privacy" as Route}>
          Privacy
        </Link>
        <Link className="text-[var(--color-primary)] hover:underline" href={"/legal/cookies" as Route}>
          Cookies
        </Link>
      </footer>
    </main>
  );
}
