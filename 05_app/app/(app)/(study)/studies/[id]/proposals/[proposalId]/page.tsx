import { ReviewProposal } from "@/components/feature/builder/review-proposal";

/**
 * Proposal review surface (ADR-0036, review-proposal.md): the original
 * author decides on an incoming proposal — message, merge preview, block +
 * protocol-text diff vs the CURRENT draft, accept/decline with comment.
 * Focused-mode chrome comes from the (study) layout.
 */
export default async function ProposalReviewPage({
  params,
}: {
  params: Promise<{ id: string; proposalId: string }>;
}) {
  const { id, proposalId } = await params;
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
      <ReviewProposal studyId={id} proposalId={proposalId} />
    </main>
  );
}
