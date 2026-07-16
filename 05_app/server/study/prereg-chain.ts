import { and, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { experimentVersion } from "@/server/db/schema";
import { readOverview } from "@/server/modules/blocks";

/**
 * The preregistration chain + claim-binding resolution (ADR-0102).
 *
 * ONE shared helper on purpose. `getPublicStudy` and `getRecordPreview` are both
 * typed `Promise<PublicStudyDetail>`, so a *missing* field is a compile error but
 * a **divergent value** is not — and "preview === published" (ADR-0056 C) would
 * break with a green build. Both producers call this; divergence now requires
 * actively not calling it.
 */

/** A frozen preregistration of a study, with the plan a claim can bind to. */
export type PreregPlan = {
  id: string;
  versionNumber: number;
  createdAt: Date;
  supersedesVersionId: string | null;
  changeSummary: string | null;
  classification: string | null;
  doi: string | null;
  registrationUrl: string | null;
  withdrawn: boolean;
  hypotheses: string[];
  /** Where this filing stands with OSF. Distinguishes "the DOI is still coming"
   *  (pending/pushed) from "it is never coming" (no_credentials/opted_out/
   *  failed) — a difference no DOI-less row can otherwise express, and one the
   *  Linked outputs gate must not paper over (ADR-0103 D4). NOT projected into
   *  `PublicPrereg`: our push plumbing is not part of the public record. */
  pushStatus: RegistryPushStatus;
};

/** Mirrors the `registry_push_status` pgEnum. */
export type RegistryPushStatus =
  | "not_pushed"
  | "pending"
  | "pushed"
  | "failed"
  | "no_credentials"
  | "opted_out";

/** One link of the public amendment history (ADR-0004 §69 — bidirectional). */
export type PublicPrereg = {
  /** Matches `claim.planVersionId`. Public-safe: a preregistration is a public
   *  artifact, and the record already exposes the study id. */
  versionId: string;
  versionNumber: number;
  filedAt: string;
  /** The frozen plan's hypotheses — the referent a bound claim names. */
  hypotheses: string[];
  /** The version this one amends, resolved in memory; null = the original filing. */
  amendsVersionNumber: number | null;
  changeSummary: string | null;
  /** Author's own label — render it attributed, never as fact (ADR-0004). */
  classification: string | null;
  doi: string | null;
  registrationUrl: string | null;
  withdrawn: boolean;
};

/**
 * Every frozen preregistration of a study, oldest → newest.
 *
 * Deliberately NOT the "latest frozen version" the public producers fetch with
 * `LIMIT 1`: for any *finished* study that row is the **published** one, which is
 * exactly why the Preregistration section and its DOI used to vanish from
 * finished records (ADR-0102 D4), and why validating a binding against it would
 * compare to the wrong hypothesis list entirely.
 */
export async function preregChain(studyId: string): Promise<PreregPlan[]> {
  const rows = await db
    .select({
      id: experimentVersion.id,
      versionNumber: experimentVersion.versionNumber,
      createdAt: experimentVersion.createdAt,
      snapshot: experimentVersion.definitionSnapshot,
      supersedesVersionId: experimentVersion.supersedesVersionId,
      changeSummary: experimentVersion.changeSummary,
      classification: experimentVersion.amendmentClassification,
      doi: experimentVersion.externalRegistrationDoi,
      registrationUrl: experimentVersion.externalRegistrationUrl,
      withdrawn: experimentVersion.registrationWithdrawn,
      pushStatus: experimentVersion.registryPushStatus,
    })
    .from(experimentVersion)
    .where(and(eq(experimentVersion.experimentId, studyId), eq(experimentVersion.kind, "preregistered")))
    .orderBy(experimentVersion.versionNumber);

  return rows.map((r) => ({
    id: r.id,
    versionNumber: r.versionNumber,
    createdAt: r.createdAt,
    supersedesVersionId: r.supersedesVersionId,
    changeSummary: r.changeSummary,
    classification: r.classification,
    doi: r.doi,
    registrationUrl: r.registrationUrl,
    withdrawn: !!r.withdrawn,
    hypotheses: readOverview(r.snapshot).hypotheses,
    pushStatus: r.pushStatus ?? "not_pushed",
  }));
}

/**
 * Project the chain for public render. `amendsVersionNumber` resolves in memory
 * from the array — never a per-row point lookup (N+1) and never a recursive walk
 * of `supersedesVersionId` (no unique index, no lock: the pointer graph can fork).
 */
export function publicPreregs(chain: PreregPlan[]): PublicPrereg[] {
  const byId = new Map(chain.map((p) => [p.id, p.versionNumber]));
  return chain.map((p) => ({
    versionId: p.id,
    versionNumber: p.versionNumber,
    filedAt: p.createdAt.toISOString(),
    hypotheses: p.hypotheses,
    amendsVersionNumber: p.supersedesVersionId ? byId.get(p.supersedesVersionId) ?? null : null,
    changeSummary: p.changeSummary,
    // An amendment is identified by supersedesVersionId, NEVER by a non-null
    // classification — the DB CHECK constrains only the supersedes/summary pair.
    classification: p.supersedesVersionId ? p.classification : null,
    doi: p.doi,
    registrationUrl: p.registrationUrl,
    withdrawn: p.withdrawn,
  }));
}

/** The newest preregistration — the operative plan, and the DOI/withdrawn source. */
export function newestPrereg(chain: PreregPlan[]): PreregPlan | undefined {
  return chain.length ? chain[chain.length - 1] : undefined;
}

/**
 * Does a claim binding resolve to a real hypothesis in a real frozen
 * preregistration **of this study**?
 *
 * The ratchet is only as strong as this check. The client sends a bare uuid, so
 * without it a record could bind to another study's preregistration — or to a
 * hypothesis index that doesn't exist — and forge "Preregistered", which is the
 * one word ADR-0102 exists to make unforgeable.
 */
export function bindingResolves(
  claim: { planVersionId: string; hypothesisIndex: number } | undefined,
  chain: Pick<PreregPlan, "id" | "hypotheses">[],
): boolean {
  if (!claim) return false;
  const plan = chain.find((p) => p.id === claim.planVersionId);
  return !!plan && claim.hypothesisIndex >= 1 && claim.hypothesisIndex <= plan.hypotheses.length;
}

/** The bound hypothesis text, for the record's referent line. */
export function boundHypothesis(
  claim: { planVersionId: string; hypothesisIndex: number } | undefined,
  chain: Pick<PreregPlan, "id" | "versionNumber" | "hypotheses">[],
): { text: string; versionNumber: number } | null {
  if (!claim) return null;
  const plan = chain.find((p) => p.id === claim.planVersionId);
  const text = plan?.hypotheses[claim.hypothesisIndex - 1];
  return plan && text ? { text, versionNumber: plan.versionNumber } : null;
}
