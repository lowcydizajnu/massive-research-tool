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
};

export type PushResult = { doi: string; url: string };

export interface RegistryAdapter {
  /** OAuth: the URL a user visits to authorize their registry account. */
  getAuthorizeUrl(input: { userId: string; redirectUri: string; state: string }): string;
  /** OAuth callback: exchange the code and store encrypted tokens for the user. */
  completeConnection(input: {
    userId: string;
    code: string;
    redirectUri: string;
  }): Promise<void>;
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
  /** Best-effort withdrawal of a pushed registration. */
  withdraw(userId: string, doi: string, reason: string): Promise<void>;
}

/**
 * The active implementation re-exports below. Switching registries is a one-line
 * change. Today: throws on first call because no implementation is wired yet.
 * PR-1c: import from "./registry.osf".
 */
export const registry: RegistryAdapter = new Proxy({} as RegistryAdapter, {
  get(_target, prop) {
    throw new Error(
      `RegistryAdapter.${String(prop)} called but no implementation is wired. ` +
        `Wire ./registry.osf (PR-1c).`,
    );
  },
});
