import { and, eq, isNull } from "drizzle-orm";
import { ulid } from "ulid";

import { db } from "@/server/db/client";
import { registry as registryTable, registryConnection } from "@/server/db/schema";
import { decryptSecret, encryptSecret } from "@/server/crypto/tokens";

import type {
  PushResult,
  RegistrationPayload,
  RegistryAdapter,
  RegistryConnectionInfo,
} from "./registry";

/**
 * OSF implementation of RegistryAdapter (ADR-0005). The only file with OSF
 * OAuth/API specifics.
 *
 * OAuth endpoints are CONFIG-DRIVEN: env vars default to OSF's documented
 * values, which the researcher's OSF developer app (registered at
 * osf.io/settings/applications) confirms. The connect flow is inert until
 * OSF_CLIENT_ID / OSF_CLIENT_SECRET are set.
 *
 * OAuth + connection, push/amend, status sync, and withdraw are all implemented
 * here against the verified OSF v2 API. Withdrawal (ADR-0005 am. 3) PATCHes the
 * registration with `pending_withdrawal` + `withdrawal_justification`.
 */
const OSF_KEY = "osf";

export function osfConfig() {
  return {
    clientId: process.env.OSF_OAUTH_CLIENT_ID ?? "",
    clientSecret: process.env.OSF_OAUTH_CLIENT_SECRET ?? "",
    /** Must match the OSF app's registered redirect URI exactly. */
    redirectUri: process.env.OSF_OAUTH_REDIRECT_URI ?? "",
    // OSF documented defaults; override per the registered app if they differ.
    authorizeUrl: process.env.OSF_AUTHORIZE_URL ?? "https://accounts.osf.io/oauth2/authorize",
    tokenUrl: process.env.OSF_TOKEN_URL ?? "https://accounts.osf.io/oauth2/token",
    apiBase: process.env.OSF_API_BASE ?? "https://api.osf.io/v2",
    scopes: process.env.OSF_SCOPES ?? "osf.full_write",
    // Registration schema to file under. "Open-Ended Registration" has a single
    // free-text `summary` response, so our lossless snapshot always validates —
    // unlike "OSF Preregistration", whose many required structured fields we'd
    // have to map field-by-field (deferred to V1.6). Override by name if needed.
    registrationSchemaName: process.env.OSF_REGISTRATION_SCHEMA ?? "Open-Ended Registration",
  };
}

/** Thrown when the user has no active OSF connection — lets the push job mark
 *  the version `no_credentials` rather than retrying a doomed request. */
export class OsfNotConnectedError extends Error {
  constructor(message = "No active OSF connection for this user.") {
    super(message);
    this.name = "OsfNotConnectedError";
  }
}

/** Whether OSF OAuth is configured on this server (client id + redirect). */
export function isOsfConfigured(): boolean {
  const cfg = osfConfig();
  return !!cfg.clientId && !!cfg.redirectUri;
}

/** Whether the OSF API base is set (the Personal Access Token path needs only
 *  this — no OAuth app required, so it works on localhost/self-hosted). */
export function isOsfApiConfigured(): boolean {
  return !!osfConfig().apiBase;
}

/** Upsert the 'osf' registry row; returns its id. */
async function ensureOsfRegistry(): Promise<string> {
  const existing = await db
    .select({ id: registryTable.id })
    .from(registryTable)
    .where(eq(registryTable.key, OSF_KEY))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const id = ulid();
  await db
    .insert(registryTable)
    .values({ id, key: OSF_KEY, name: "OSF", oauthConfig: {}, pushConfig: {} })
    .onConflictDoNothing({ target: registryTable.key });
  const row = await db
    .select({ id: registryTable.id })
    .from(registryTable)
    .where(eq(registryTable.key, OSF_KEY))
    .limit(1);
  return row[0]!.id;
}

/** OSF JSON:API media type (required Content-Type/Accept for v2 writes). */
const JSON_API = "application/vnd.api+json";

/** Decrypt the user's active OSF access token, or throw OsfNotConnectedError. */
async function osfAccessToken(userId: string): Promise<string> {
  const registryId = await ensureOsfRegistry();
  const rows = await db
    .select({ accessToken: registryConnection.accessToken })
    .from(registryConnection)
    .where(
      and(
        eq(registryConnection.userId, userId),
        eq(registryConnection.registryId, registryId),
        isNull(registryConnection.revokedAt),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw new OsfNotConnectedError();
  return decryptSecret(row.accessToken);
}

/** Thin JSON:API fetch against the OSF API. Throws on non-2xx with the OSF error
 *  body attached. `path` is relative to apiBase (e.g. "/nodes/"). */
async function osfApi(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ data: Record<string, unknown> & { id?: string; attributes?: Record<string, unknown>; links?: Record<string, unknown> } }> {
  const cfg = osfConfig();
  const res = await fetch(`${cfg.apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: JSON_API,
      ...(body ? { "Content-Type": JSON_API } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 401) {
    throw new OsfNotConnectedError(
      "OSF rejected the stored token (it may have been revoked or regenerated) — reconnect in Settings · Connections.",
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OSF ${method} ${path} failed: ${res.status} ${text}`);
  }
  return (await res.json()) as { data: { id?: string } };
}

/** Resolve the registration-schema id by name (e.g. "Open-Ended Registration").
 *  OSF does NOT support filter[name] on this collection (returns 400), so we
 *  page through the list and match on attributes.name client-side. */
async function resolveSchemaId(token: string, schemaName?: string): Promise<string> {
  const name = schemaName ?? osfConfig().registrationSchemaName;
  let url: string | null = `${osfConfig().apiBase}/schemas/registrations/?page[size]=100`;
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: JSON_API },
    });
    if (res.status === 401) {
      throw new OsfNotConnectedError(
        "OSF rejected the stored token (it may have been revoked or regenerated) — reconnect in Settings · Connections.",
      );
    }
    if (!res.ok) throw new Error(`OSF schema lookup failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as {
      data: Array<{ id: string; attributes?: { name?: string } }>;
      links?: { next?: string | null };
    };
    const match = json.data.find((s) => s.attributes?.name === name);
    if (match) return match.id;
    url = json.links?.next ?? null;
  }
  throw new Error(`OSF registration schema not found: ${name}`);
}

/** A human-readable summary of the snapshot for the Open-Ended `summary` response.
 *  Lossless detail lives in the JSON appended below the prose. */
function buildSummary(payload: RegistrationPayload): string {
  const json = JSON.stringify(payload.snapshot, null, 2);
  const link = payload.permalink ? `\n\nStudy: ${payload.permalink}` : "";
  const body = payload.humanReadableBody ? `\n\n${payload.humanReadableBody}` : "";
  return (
    `${payload.summaryPrefix ? `${payload.summaryPrefix}\n\n` : ""}` +
    `${payload.title}\n\n` +
    `Preregistered from Massive Research Tool (experiment version ${payload.experimentVersionId}).` +
    link +
    body +
    `\n\n--- Machine-readable design snapshot ---\n${json}`
  );
}

export const osfRegistry: RegistryAdapter = {
  getAuthorizeUrl({ state }) {
    const cfg = osfConfig();
    const url = new URL(cfg.authorizeUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", cfg.clientId);
    url.searchParams.set("redirect_uri", cfg.redirectUri);
    url.searchParams.set("scope", cfg.scopes);
    url.searchParams.set("state", state);
    return url.toString();
  },

  async completeConnection({ userId, code }) {
    const cfg = osfConfig();
    const res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: cfg.redirectUri,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
      }),
    });
    if (!res.ok) {
      throw new Error(`OSF token exchange failed: ${res.status} ${await res.text()}`);
    }
    const tok = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      scope?: string;
    };

    const registryId = await ensureOsfRegistry();
    await db
      .insert(registryConnection)
      .values({
        id: ulid(),
        userId,
        registryId,
        accessToken: encryptSecret(tok.access_token),
        refreshToken: tok.refresh_token ? encryptSecret(tok.refresh_token) : null,
        scopes: tok.scope ? tok.scope.split(" ") : cfg.scopes.split(" "),
        revokedAt: null,
      })
      .onConflictDoUpdate({
        target: [registryConnection.userId, registryConnection.registryId],
        set: {
          accessToken: encryptSecret(tok.access_token),
          refreshToken: tok.refresh_token ? encryptSecret(tok.refresh_token) : null,
          connectedAt: new Date(),
          revokedAt: null,
        },
      });
  },

  async connectWithToken({ userId, token }) {
    const trimmed = token.trim();
    if (!trimmed) throw new Error("Paste a Personal Access Token to connect.");
    const cfg = osfConfig();

    // Validate the token by reading the owning OSF user. A bad/expired/wrong-scope
    // token fails here, before anything is stored — so we never persist a token
    // that can't actually push.
    const res = await fetch(`${cfg.apiBase}/users/me/`, {
      headers: { Authorization: `Bearer ${trimmed}`, Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(
        `OSF rejected the token (${res.status}). Generate one at osf.io/settings/tokens ` +
          `with the osf.full_write scope and try again.`,
      );
    }

    const registryId = await ensureOsfRegistry();
    await db
      .insert(registryConnection)
      .values({
        id: ulid(),
        userId,
        registryId,
        accessToken: encryptSecret(trimmed),
        refreshToken: null, // PATs don't refresh; the user reissues if revoked
        scopes: ["osf.full_write"],
        revokedAt: null,
      })
      .onConflictDoUpdate({
        target: [registryConnection.userId, registryConnection.registryId],
        set: {
          accessToken: encryptSecret(trimmed),
          refreshToken: null,
          connectedAt: new Date(),
          revokedAt: null,
        },
      });
  },

  async disconnect(userId) {
    const registryId = await ensureOsfRegistry();
    await db
      .update(registryConnection)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(registryConnection.userId, userId),
          eq(registryConnection.registryId, registryId),
        ),
      );
  },

  async getConnection(userId): Promise<RegistryConnectionInfo> {
    const registryId = await ensureOsfRegistry();
    const rows = await db
      .select({ connectedAt: registryConnection.connectedAt })
      .from(registryConnection)
      .where(
        and(
          eq(registryConnection.userId, userId),
          eq(registryConnection.registryId, registryId),
          isNull(registryConnection.revokedAt),
        ),
      )
      .limit(1);
    const row = rows[0];
    return {
      connected: !!row,
      connectedAt: row ? row.connectedAt.toISOString() : null,
    };
  },

  // Push fires from the Preregister stage via the background job. Token
  // decryption happens here, inside the adapter, so plaintext never leaves it.
  // Flow verified against OSF's APIv2 swagger + api/registrations/serializers.py
  // (RegistrationCreateSerializer): node -> draft_registration -> PATCH
  // registration_responses -> register (registration_choice "immediate").
  // NOTE: OSF then calls require_approval() — the registration is pending and
  // the DOI is minted on approval, so `doi` is null at push time (backfilled).
  async pushRegistration(userId, payload): Promise<PushResult> {
    const token = await osfAccessToken(userId);

    // 1. Resolve the schema FIRST — it's a read, and doing it before any write
    //    means a lookup failure can't leave an orphan project node behind.
    const schemaId = await resolveSchemaId(token, payload.schemaName);

    // 2. Project node to register from — amendments reuse the original node
    //    (ADR-0005 am. 3) so a study's registrations share one OSF project.
    let nodeId = payload.existingNodeId ?? null;
    if (!nodeId) {
      const node = await osfApi(token, "POST", "/nodes/", {
        data: {
          type: "nodes",
          attributes: {
            title: payload.title,
            category: "project",
            public: false,
            // Enrichment (audit step 3) — standard node attributes; safe to omit.
            ...(payload.description ? { description: payload.description } : {}),
            ...(payload.tags && payload.tags.length ? { tags: payload.tags } : {}),
          },
        },
      });
      nodeId = node.data.id!;

      // 2b. Co-authors → OSF contributors on the NEW node (ADR-0005 am. 4).
      //     Added only when a node is created (amendments reuse the node, where
      //     they already exist). Pushed as UNREGISTERED contributors
      //     (full_name + optional email) since our users aren't OSF accounts.
      //     Shape verified against OSF NodeContributorsCreateSerializer:
      //     type "contributors"; bibliographic; permission read|write|admin;
      //     full_name/email for unregistered. send_email=false → no surprise
      //     claim emails. Best-effort per contributor: a failure must NEVER
      //     abort the registration (the registration is the critical artifact).
      for (const c of payload.contributors ?? []) {
        try {
          await osfApi(token, "POST", `/nodes/${nodeId}/contributors/?send_email=false`, {
            data: {
              type: "contributors",
              attributes: {
                full_name: c.fullName,
                bibliographic: true,
                permission: "write",
                ...(c.email ? { email: c.email } : {}),
              },
            },
          });
        } catch {
          // Skip this contributor; continue with the registration.
        }
      }
    }

    // 3. Draft registration under that node, bound to the chosen schema.
    const draft = await osfApi(token, "POST", `/nodes/${nodeId}/draft_registrations/`, {
      data: {
        type: "draft_registrations",
        relationships: {
          registration_schema: {
            data: { type: "registration_schemas", id: schemaId },
          },
        },
      },
    });
    const draftId = draft.data.id!;

    // 4. Fill the draft's registration_responses (Open-Ended: a single summary).
    await osfApi(token, "PATCH", `/draft_registrations/${draftId}/`, {
      data: {
        id: draftId,
        type: "draft_registrations",
        attributes: {
          title: payload.title,
          registration_responses: payload.registrationResponses ?? { summary: buildSummary(payload) },
        },
      },
    });

    // 5. Register the draft immediately (enters pending-approval on OSF).
    const reg = await osfApi(token, "POST", `/nodes/${nodeId}/registrations/`, {
      data: {
        type: "registrations",
        attributes: { draft_registration: draftId, registration_choice: "immediate" },
      },
    });
    const registrationId = reg.data.id!;
    const url =
      (reg.data.links?.html as string | undefined) ?? `https://osf.io/${registrationId}/`;

    return { registrationId, url, doi: null, nodeId };
  },

  /** An amendment is a NEW registration on the SAME project node; the job
   *  builds the amendment header/responses and passes existingNodeId — this
   *  is the same verified flow with node creation skipped (ADR-0005 am. 3). */
  async pushAmendment(userId, payload, _priorDoi): Promise<PushResult> {
    return osfRegistry.pushRegistration(userId, payload);
  },

  /** Two-way sync (ADR-0005 am. 3): approval + DOI via the registration's
   *  identifiers (DOI category) — verified live against api.osf.io 2026-06-12. */
  async getRegistrationStatus(userId, registrationId) {
    const token = await osfAccessToken(userId);
    const cfg = osfConfig();
    const headers = { Authorization: `Bearer ${token}`, Accept: JSON_API };
    const regRes = await fetch(`${cfg.apiBase}/registrations/${registrationId}/`, { headers });
    if (regRes.status === 401) {
      throw new OsfNotConnectedError(
        "OSF rejected the stored token (it may have been revoked or regenerated) — reconnect in Settings · Connections.",
      );
    }
    if (!regRes.ok) throw new Error(`OSF registration lookup failed: ${regRes.status}`);
    const reg = (await regRes.json()) as {
      data: { attributes: { pending_registration_approval?: boolean; withdrawn?: boolean; public?: boolean } };
    };
    const idsRes = await fetch(`${cfg.apiBase}/registrations/${registrationId}/identifiers/`, { headers });
    let doi: string | null = null;
    if (idsRes.ok) {
      const ids = (await idsRes.json()) as { data: Array<{ attributes: { category: string; value: string } }> };
      doi = ids.data.find((i) => i.attributes.category === "doi")?.attributes.value ?? null;
    }
    return {
      doi,
      pendingApproval: !!reg.data.attributes.pending_registration_approval,
      withdrawn: !!reg.data.attributes.withdrawn,
      public: !!reg.data.attributes.public,
    };
  },

  /**
   * Withdraw (retract) a pushed registration (ADR-0005 am. 3). Verified against
   * the OSF API source: a registration is retracted by PATCHing the registration
   * detail with `pending_withdrawal: true` + `withdrawal_justification` — this
   * triggers OSF's `retract_registration`, which opens a withdrawal pending the
   * approval of the registration's active contributors (a withdrawn registration
   * keeps a public tombstone: title, contributors, justification). There is no
   * direct "withdraw" endpoint and the /requests/ collection is read-only.
   */
  async withdraw(userId, doi, reason): Promise<void> {
    const registrationId = osfIdFromDoi(doi);
    if (!registrationId) throw new Error(`Could not derive an OSF registration id from "${doi}".`);
    const token = await osfAccessToken(userId);
    const cfg = osfConfig();
    const res = await fetch(`${cfg.apiBase}/registrations/${registrationId}/`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": JSON_API, Accept: JSON_API },
      body: JSON.stringify({
        data: {
          type: "registrations",
          id: registrationId,
          attributes: { pending_withdrawal: true, withdrawal_justification: reason },
        },
      }),
    });
    if (res.status === 401) {
      throw new OsfNotConnectedError(
        "OSF rejected the stored token (it may have been revoked or regenerated) — reconnect in Settings · Connections.",
      );
    }
    if (!res.ok) {
      throw new Error(`OSF withdrawal failed: ${res.status} ${(await res.text()).slice(0, 500)}`);
    }
  },

  // Push the Record summary to the mutable project node (ADR-0056 E4b). PATCHes
  // the node `description` — the same writable field set at node creation — so
  // this is the verified node endpoint, not a new one. The frozen registration
  // is never touched (that's what amendments are for, ADR-0056 E4a).
  async pushRecordSummary(userId, { nodeId, summary }): Promise<void> {
    const token = await osfAccessToken(userId);
    const cfg = osfConfig();
    const res = await fetch(`${cfg.apiBase}/nodes/${nodeId}/`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": JSON_API, Accept: JSON_API },
      body: JSON.stringify({
        data: { type: "nodes", id: nodeId, attributes: { description: summary } },
      }),
    });
    if (res.status === 401) {
      throw new OsfNotConnectedError(
        "OSF rejected the stored token (it may have been revoked or regenerated) — reconnect in Settings · Connections.",
      );
    }
    if (!res.ok) {
      throw new Error(`OSF record push failed: ${res.status} ${(await res.text()).slice(0, 500)}`);
    }
  },
};

/** Derive the OSF registration GUID from a DOI like "10.17605/OSF.IO/RXZQA" (or a bare guid). */
export function osfIdFromDoi(doi: string): string | null {
  const m = doi.match(/OSF\.IO\/(\w+)/i);
  if (m) return m[1].toLowerCase();
  return /^\w+$/.test(doi.trim()) ? doi.trim().toLowerCase() : null;
}
