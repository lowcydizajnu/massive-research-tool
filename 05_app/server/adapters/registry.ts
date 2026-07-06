/**
 * RegistryAdapter — vendor/registry-agnostic preregistration push (ADR-0005).
 *
 * OSF is the V1 implementation (`registry.osf.ts`); AsPredicted /
 * ClinicalTrials.gov / PsyArXiv would be future implementations of the same
 * interface. Per-user OAuth (researchers own their registry identity); push is
 * async via the BackgroundJobAdapter. No registry SDK/HTTP outside the
 * `registry.<vendor>.ts` files.
 *
 * Today: the interface + a Proxy default that throws until `registry.osf.ts`
 * is wired (PR-1c).
 */

export type RegistryConnectionInfo = {
  connected: boolean;
  connectedAt: string | null; // ISO 8601
};

/** What we push for a preregistration (built from the immutable ExperimentVersion). */
export type RegistrationPayload = {
  experimentVersionId: string;
  title: string;
  /** Lossless machine-readable snapshot (definition_snapshot + locks + theme_snapshot). */
  snapshot: Record<string, unknown>;
  /** OSF preregistration template fields mapped from definition_snapshot.preregistration. */
  templateFields: Record<string, unknown>;
  /** Registration schema to file under (defaults to the adapter's configured
   *  Open-Ended schema). The Replication Recipe push sets this (ADR-0005 am. 3). */
  schemaName?: string;
  /** Pre-built registration_responses for structured schemas. Absent → the
   *  adapter files its default single-summary response. */
  registrationResponses?: Record<string, unknown>;
  /** Reuse an existing project node (amendments register on the same node). */
  existingNodeId?: string | null;
  /** Prepended to the default summary (amendment headers). */
  summaryPrefix?: string;
  /** Human-readable design (abstract + hypotheses + protocol) for the Open-Ended
   *  summary, above the machine JSON — so OSF shows real content, not just a dump
   *  (audit step 3). */
  humanReadableBody?: string;
  /** OSF project-node enrichment (audit step 3): a one-line description, a
   *  permalink back to the study, and study tags. Absent → node stays minimal. */
  description?: string;
  permalink?: string;
  tags?: string[];
  /** Co-authors to add to the OSF project node as contributors (ADR-0005 am. 4).
   *  Added only when a NEW node is created (amendments reuse the node, where they
   *  already exist). Pushed as UNREGISTERED contributors (full_name + optional
   *  email) since our users are not OSF accounts; best-effort per contributor. */
  contributors?: { fullName: string; email: string | null }[];
};

export type PushResult = {
  /** The registry's identifier for the registration (OSF: the registration GUID). */
  registrationId: string;
  /** Public registration URL (OSF: https://osf.io/{guid}/). Available immediately. */
  url: string;
  /** DOI — NULL at push time on OSF: a freshly-registered registration enters
   *  pending-approval and OSF mints the DOI only on approval. Backfilled later
   *  by polling the registration's identifiers (ADR-0005 amendment 2026-06-03). */
  doi: string | null;
  /** The project node registered from — stored so amendments reuse it. */
  nodeId: string | null;
};

export type RegistrationStatus = {
  doi: string | null;
  pendingApproval: boolean;
  withdrawn: boolean;
  public: boolean;
};

/** One file to upload to the registry's file storage (ADR-0094). */
export type MaterialFile = {
  /** Caller's stable identity for the artifact (R2 key or a sentinel) — echoed
   *  back in the result so the caller can persist per-artifact state. */
  artifactKey: string;
  /** Filename to create on the registry. */
  fileName: string;
  bytes: Uint8Array;
  contentType?: string;
  /** The registry's file id from a prior upload — present → update (new version)
   *  rather than create, avoiding a name collision. */
  existingOsfFileId?: string | null;
};

/** Outcome of one file upload (ADR-0094). Never throws for a single file — a
 *  failure is reported here so one bad file doesn't abort the batch. */
export type MaterialUploadResult = {
  artifactKey: string;
  fileName: string;
  status: "uploaded" | "failed";
  /** The registry file id (for a later new-version update); null on failure. */
  osfFileId: string | null;
  /** The registry's internal path for the file (diagnostic). */
  osfPath: string | null;
  /** A human-openable URL to view the file on the registry. */
  osfUrl: string | null;
  error?: string;
};

export interface RegistryAdapter {
  /** OAuth: the URL a user visits to authorize their registry account. The
   *  redirect URI is adapter config (must match the registered app), not a
   *  per-call value. */
  getAuthorizeUrl(input: { userId: string; state: string }): string;
  /** OAuth callback: exchange the code and store encrypted tokens for the user. */
  completeConnection(input: { userId: string; code: string }): Promise<void>;
  /** Alternative to OAuth: connect with a Personal Access Token the user pastes.
   *  The token is validated against the registry API, then stored encrypted in
   *  the same `registry_connection` row as an OAuth token. This is the path that
   *  works for localhost/self-hosted and is the only one the automated e2e can
   *  drive (OAuth needs an interactive registry login). See ADR-0005 (PAT
   *  amendment). */
  connectWithToken(input: { userId: string; token: string }): Promise<void>;
  /** Revoke the user's connection locally (does not delete already-pushed registrations). */
  disconnect(userId: string): Promise<void>;
  /** Whether the user has an active connection. */
  getConnection(userId: string): Promise<RegistryConnectionInfo>;
  /** Push a new preregistration under the user's account. */
  pushRegistration(userId: string, payload: RegistrationPayload): Promise<PushResult>;
  /** Push an amendment referencing the prior registration's DOI (ADR-0004). */
  pushAmendment(
    userId: string,
    payload: RegistrationPayload,
    priorDoi: string,
  ): Promise<PushResult>;
  /** Poll a pushed registration for approval/DOI (two-way sync, ADR-0005 am. 3). */
  getRegistrationStatus(userId: string, registrationId: string): Promise<RegistrationStatus>;
  /** Best-effort withdrawal of a pushed registration. */
  withdraw(userId: string, doi: string, reason: string): Promise<void>;
  /**
   * Push the Study Record summary to the MUTABLE project node (ADR-0056 E4b /
   * ADR-0054 face-vs-archive). The registration is immutable; the parent project
   * node is where the readable face lives, so a non-plan "update" (abstract +
   * article link + record URL) PATCHes the node's `description` — the same field
   * set at node creation. Not an amendment (ADR-0056 E4a). `nodeId` is the OSF
   * project node from the original push (`registry_push.responsePayload.nodeId`).
   */
  pushRecordSummary(userId: string, input: { nodeId: string; summary: string }): Promise<void>;
  /**
   * Upload study materials (files) to the MUTABLE project node's file storage
   * (ADR-0094). Never targets the frozen registration (immutable). Creates/reuses
   * a folder, then creates or new-versions each file. Per-file failures are
   * returned, not thrown, so one bad file doesn't abort the batch. `nodeId` is
   * the OSF project node from the original push
   * (`registry_push.responsePayload.nodeId`).
   */
  uploadMaterials(
    userId: string,
    input: { nodeId: string; folderName: string; files: MaterialFile[] },
  ): Promise<MaterialUploadResult[]>;
}

// Active implementation. Switching registries is a one-line change here.
import { osfRegistry } from "./registry.osf";

export const registry: RegistryAdapter = osfRegistry;
