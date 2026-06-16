/**
 * RecruitmentAdapter — vendor-agnostic recruitment-provider integration
 * (ADR-0047). Mirrors the OSF `RegistryAdapter` (ADR-0005): one typed interface,
 * one file per vendor (`recruitment.<vendor>.ts`, the only importer of that
 * vendor's API per ADR-0007), AES-256-GCM token encryption at the storage layer.
 *
 * PII boundary (ADR-0014 amendment, V1.15): the adapter NEVER returns participant
 * PII. `ProviderSubmission` carries an opaque `externalPid`, a status, and
 * timestamps — and has no field for names, emails, IPs, or user agents. The
 * contract is the boundary: even if a provider API returns a name, no call site
 * can persist it because the adapter never surfaces it.
 *
 * V1.15.0 ships Prolific (PAT-first). The lifecycle/submission methods are
 * exercised from Stream P2 onward; Stream P1 uses only `validateToken` +
 * `disconnect` (the Connections sub-view).
 */

export type RecruitmentProvider = "prolific";

export type Currency = "USD" | "EUR" | "GBP";

/** A per-participant attempt on the provider's side. NO names/emails/IPs — provider-side PII stays on the provider. */
export type ProviderSubmission = {
  submissionId: string; // provider's id for this attempt
  externalPid: string; // the participant's opaque id on the provider (Prolific PID, etc.)
  status: "started" | "submitted" | "approved" | "rejected" | "timed-out";
  startedAt: Date;
  completedAt?: Date;
};

export type Eligibility = {
  /** ISO 3166-1 alpha-2 country codes (P1b). */
  country?: string[];
  /** ISO 639-1 language codes (P1b). */
  language?: string[];
};

/**
 * Normalized lifecycle state of a study on the provider's side (P2). Lets us
 * reflect the TRUE provider status (a study can be paused/completed on Prolific
 * without us ever clicking Stop) rather than only our stored live/stopped flag.
 */
export type ProviderStudyState =
  | "unpublished" // created but not yet recruiting
  | "active" // recruiting now
  | "paused" // temporarily not recruiting
  | "awaiting_review" // fully recruited, submissions awaiting the researcher
  | "completed" // done
  | "unknown";

export interface RecruitmentAdapter {
  /**
   * Validate a pasted Personal Access Token (PAT-first per ADR-0047) and return
   * the opaque provider user id. Throws on an invalid token; the caller
   * distinguishes "bad token" from "provider unreachable" via the thrown error.
   */
  validateToken(opts: { accessToken: string }): Promise<{ providerUserId: string }>;

  /** Best-effort provider-side revoke on disconnect. PATs often can't be revoked via API → no-op. */
  disconnect(opts: { accessToken: string }): Promise<void>;

  // Study lifecycle on the provider side (Stream P2+).
  createStudy(opts: {
    accessToken: string;
    title: string;
    description: string;
    recruitmentUrl: string; // our /take URL
    targetN: number;
    reward: { amount: number; currency: Currency };
    eligibility?: Eligibility;
  }): Promise<{ providerStudyId: string; providerStudyUrl: string }>;
  publishStudy(opts: { accessToken: string; providerStudyId: string }): Promise<void>;
  pauseStudy(opts: { accessToken: string; providerStudyId: string }): Promise<void>;
  closeStudy(opts: { accessToken: string; providerStudyId: string }): Promise<void>;

  /**
   * The study's current lifecycle state + recruitment progress on the provider
   * (P2). Used to reconcile our stored status with reality — a study can be
   * paused or completed on the provider without us ever calling closeStudy.
   */
  getStudy(opts: { accessToken: string; providerStudyId: string }): Promise<{
    state: ProviderStudyState;
    placesTaken: number;
    totalPlaces: number;
  }>;

  // Submissions (Stream P2+).
  listSubmissions(opts: { accessToken: string; providerStudyId: string }): Promise<ProviderSubmission[]>;
  approveSubmission(opts: { accessToken: string; submissionId: string }): Promise<void>;
  rejectSubmission(opts: { accessToken: string; submissionId: string; reason: string }): Promise<void>;
  sendBonus(opts: { accessToken: string; submissionId: string; amount: number; reason: string }): Promise<void>;

  /** Verify a provider-pushed webhook's signature (Stream P7). */
  verifyWebhookSignature(opts: { rawBody: string; signature: string }): boolean;
}

/** Thrown by an adapter when the provider is unreachable (vs an invalid token). Lets the UI offer Retry, not a token error. */
export class ProviderUnreachableError extends Error {
  constructor(message = "The recruitment provider is unreachable right now.") {
    super(message);
    this.name = "ProviderUnreachableError";
  }
}

/** Thrown when a token is rejected by the provider (401/403). The UI shows a token error. */
export class InvalidProviderTokenError extends Error {
  constructor(message = "That token didn't work — check you copied it fully.") {
    super(message);
    this.name = "InvalidProviderTokenError";
  }
}

/**
 * Resolve the adapter for a provider. Lazy `require` so the vendor file (and any
 * SDK it imports) only loads when actually used, and so tests can mock the
 * vendor module per ADR-0007.
 */
export function getRecruitmentAdapter(provider: RecruitmentProvider): RecruitmentAdapter {
  switch (provider) {
    case "prolific": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { prolificAdapter } = require("./recruitment.prolific") as typeof import("./recruitment.prolific");
      return prolificAdapter;
    }
    default: {
      const exhaustive: never = provider;
      throw new Error(`Unknown recruitment provider: ${String(exhaustive)}`);
    }
  }
}
