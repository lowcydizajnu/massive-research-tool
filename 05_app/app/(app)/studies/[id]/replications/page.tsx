import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";

import { getServerApi } from "@/server/trpc/server";
import type { ReplicationTree, ReplicationTreeNode, StudyDetail } from "@/server/trpc/routers/studies";

function linkFor(n: { studyId: string; inWorkspace: boolean; visible: boolean; isCurrent?: boolean }): Route | null {
  if (n.isCurrent) return null;
  if (n.inWorkspace) return `/studies/${n.studyId}/build` as Route;
  if (n.visible) return `/browse/${n.studyId}` as Route;
  return null;
}

function Label({ node }: { node: ReplicationTreeNode | ReplicationTree["ancestors"][number] & { isCurrent?: boolean } }) {
  const text = node.title ?? "Private replication";
  const href = linkFor(node);
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      {href ? (
        <Link href={href} className="font-medium text-[var(--color-text-primary)] underline-offset-2 hover:underline">
          {text}
        </Link>
      ) : (
        <span className="font-medium text-[var(--color-text-primary)]">{text}</span>
      )}
      {node.authorName ? (
        <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">by {node.authorName}</span>
      ) : null}
    </span>
  );
}

function TreeNode({ node }: { node: ReplicationTreeNode }) {
  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="shrink-0 rounded-full bg-[var(--color-surface-subtle)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Gen {node.generation}
        </span>
        <Label node={node} />
        {node.isCurrent ? (
          <span className="rounded-full bg-[var(--color-primary-subtle)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-primary-text-on-subtle)]">
            this study
          </span>
        ) : null}
      </div>
      {node.children.length ? (
        <ul className="ml-3 flex flex-col gap-2 border-l border-[var(--color-border-subtle)] pl-4">
          {node.children.map((c) => (
            <TreeNode key={c.studyId} node={c} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * Replication navigation (V1.12 E) — upstream origin lineage + the nested
 * descendant fork tree for a study (recursive over fork_of_experiment_id).
 */
export default async function ReplicationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = await getServerApi();
  let study: StudyDetail | null = null;
  let tree: ReplicationTree | null = null;
  try {
    study = await api.studies.get({ id });
    tree = await api.studies.getReplicationTree({ studyId: id });
  } catch {
    study = null;
  }
  if (!study || !tree) notFound();

  const hasNetwork = tree.ancestors.length > 0 || tree.root.children.length > 0;

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="flex flex-1 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            <Link href={`/studies/${study.id}/build`} className="hover:underline">
              {study.title}
            </Link>
            <span aria-hidden>›</span>
            <span>Replications</span>
          </div>
          <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
            Replication lineage
          </h1>
        </div>

        {tree.ancestors.length > 0 ? (
          <section className="flex flex-col gap-2">
            <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
              Origin
            </span>
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[length:var(--text-body)]">
              {tree.ancestors.map((a) => (
                <li key={a.studyId} className="flex items-center gap-2">
                  <Label node={a} />
                  <span aria-hidden className="text-[var(--color-text-muted)]">→</span>
                </li>
              ))}
              <li className="font-medium text-[var(--color-text-primary)]">{study.title}</li>
            </ol>
          </section>
        ) : null}

        <section className="flex flex-col gap-2">
          <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
            This study + its replications
          </span>
          <ul className="flex flex-col gap-2">
            <TreeNode node={tree.root} />
          </ul>
        </section>

        {!hasNetwork ? (
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            No replications yet — when someone Replicates this study (or you fork it), the lineage
            appears here.
          </p>
        ) : null}
      </div>
    </main>
  );
}
