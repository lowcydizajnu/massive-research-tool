import { and, eq, isNull } from "drizzle-orm";
import { ulid } from "ulid";

import { db } from "@/server/db/client";
import { registry as registryTable, registryConnection } from "@/server/db/schema";
import { decryptSecret, encryptSecret } from "@/server/crypto/tokens";

import type {
  LinkedResource,
  MaterialUploadResult,
  PushResult,
  RegistrationPayload,
  RegistryAdapter,
  RegistryConnectionInfo,
  RegistryResourceType,
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
    // WaterButler file host (ADR-0094) — file bytes go here, NOT apiBase. Same
    // bearer token; `osf.full_write` already covers file write (NODE_FILE_WRITE).
    filesBase: process.env.OSF_FILES_BASE ?? "https://files.osf.io/v1",
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

/** Read a registration's DOI off `/registrations/{id}/identifiers/` (category
 *  "doi"). Best-effort by contract: returns null rather than throwing, because
 *  both callers have a registration in hand that must not be lost over a failed
 *  identifier read — `runOsfWatch` backfills whatever this misses. */
async function fetchRegistrationDoi(token: string, registrationId: string): Promise<string | null> {
  try {
    const res = await fetch(`${osfConfig().apiBase}/registrations/${registrationId}/identifiers/`, {
      headers: { Authorization: `Bearer ${token}`, Accept: JSON_API },
    });
    if (!res.ok) return null;
    const ids = (await res.json()) as { data?: Array<{ attributes?: { category?: string; value?: string } }> };
    return ids.data?.find((i) => i.attributes?.category === "doi")?.attributes?.value ?? null;
  } catch {
    return null;
  }
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
    `Preregistered from My Research Lab (experiment version ${payload.experimentVersionId}).` +
    link +
    body +
    `\n\n--- Machine-readable design snapshot ---\n${json}`
  );
}

/* ---------- OSF file storage (WaterButler) — ADR-0094 ----------
 * File BYTES go to the WaterButler host (`filesBase`), not the JSON:API host.
 * Same bearer token; `osf.full_write` covers file write. We only ever write to
 * the mutable PROJECT node (registrations are immutable). osfstorage identifies
 * items by opaque path ids; the v2 file listing gives them to us.
 */

/** A v2 osfstorage file/folder item (only the fields we read). */
type OsfFileItem = {
  attributes?: { kind?: string; name?: string; path?: string };
  relationships?: { files?: { links?: { related?: { href?: string } } } };
};

/** Strip the leading slash WaterButler/v2 put on `attributes.path`
 *  ("/<id>/" → "<id>/", "/<id>" → "<id>"). */
function osfPathId(path: string | undefined): string {
  return (path ?? "").replace(/^\/+/, "");
}

/** Page through a v2 osfstorage listing, yielding every item. */
async function osfListFiles(token: string, url: string): Promise<OsfFileItem[]> {
  const out: OsfFileItem[] = [];
  let next: string | null = url;
  while (next) {
    const res = await fetch(next, { headers: { Authorization: `Bearer ${token}`, Accept: JSON_API } });
    if (res.status === 401) {
      throw new OsfNotConnectedError(
        "OSF rejected the stored token (it may have been revoked or regenerated) — reconnect in Settings · Connections.",
      );
    }
    if (!res.ok) throw new Error(`OSF file listing failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { data: OsfFileItem[]; links?: { next?: string | null } };
    out.push(...json.data);
    next = json.links?.next ?? null;
  }
  return out;
}

/** Find a folder by name at the node's osfstorage root. Returns its path id
 *  ("<id>/") + the href to list its children, or null when absent. */
async function findOsfFolder(
  token: string,
  nodeId: string,
  name: string,
): Promise<{ pathId: string; childrenHref: string | null } | null> {
  const cfg = osfConfig();
  const items = await osfListFiles(token, `${cfg.apiBase}/nodes/${nodeId}/files/osfstorage/`);
  const match = items.find((i) => i.attributes?.kind === "folder" && i.attributes?.name === name);
  if (!match) return null;
  return {
    pathId: osfPathId(match.attributes?.path),
    childrenHref: match.relationships?.files?.links?.related?.href ?? null,
  };
}

/** Ensure the materials folder exists at the node root; returns its upload path
 *  id ("<id>/") + a children-listing href (null when we just created it, since
 *  a fresh folder is empty so no name collision is possible). */
async function ensureOsfFolder(
  token: string,
  nodeId: string,
  name: string,
): Promise<{ pathId: string; childrenHref: string | null }> {
  const found = await findOsfFolder(token, nodeId, name);
  if (found) return found;
  const cfg = osfConfig();
  const res = await fetch(
    `${cfg.filesBase}/resources/${nodeId}/providers/osfstorage/?kind=folder&name=${encodeURIComponent(name)}`,
    { method: "PUT", headers: { Authorization: `Bearer ${token}` } },
  );
  if (res.status === 401) {
    throw new OsfNotConnectedError(
      "OSF rejected the stored token (it may have been revoked or regenerated) — reconnect in Settings · Connections.",
    );
  }
  if (res.status === 409) {
    // Raced / already exists — re-read.
    const again = await findOsfFolder(token, nodeId, name);
    if (again) return again;
  }
  if (!res.ok) throw new Error(`OSF folder create failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { data?: OsfFileItem };
  return { pathId: osfPathId(data.data?.attributes?.path), childrenHref: null };
}

/** PUT raw bytes to WaterButler (create or update). Returns the raw Response so
 *  the caller can branch on 409 (name collision). */
function osfWbPut(token: string, url: string, bytes: Uint8Array, contentType?: string): Promise<Response> {
  return fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(contentType ? { "Content-Type": contentType } : {}),
    },
    // aws4fetch/WaterButler want the raw body, not a form/JSON envelope.
    body: bytes as unknown as BodyInit,
  });
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
  // NOTE: OSF then calls require_approval(). Approval gates the registration
  // going public — NOT the DOI, which is minted at registration time (step 6).
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

    // 6. Ask for the DOI now. Verified live 2026-07-16: every registration on
    //    the account (8/8, including a private one and two withdrawn ones) had
    //    a DOI on /identifiers/ within seconds of registering — so the DOI is
    //    normally available here and the caller's gates resolve immediately.
    //    Best-effort: a pending-approval registration may not have one yet
    //    (unobserved but possible), and a transient failure must never lose a
    //    registration that OSF has already accepted. Either way `runOsfWatch`
    //    backfills it, which is what kept these DOIs missing until now.
    const doi = await fetchRegistrationDoi(token, registrationId);

    return { registrationId, url, doi, nodeId };
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
    return {
      doi: await fetchRegistrationDoi(token, registrationId),
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

  // Upload materials to the mutable project node's osfstorage (ADR-0094). Files
  // go into a named folder; each file is created (201) or, when we already know
  // its OSF id, updated in place (200 → new version). A create that hits a name
  // collision (409) resolves the existing file's id from the folder listing and
  // updates it instead — so re-pushing never duplicates. Per-file failures are
  // captured, never thrown, so one bad file can't abort the batch. Only the
  // frozen registration is off-limits; the project node is writable.
  async uploadMaterials(userId, { nodeId, folderName, files }): Promise<MaterialUploadResult[]> {
    const token = await osfAccessToken(userId);
    const cfg = osfConfig();
    const provider = `${cfg.filesBase}/resources/${nodeId}/providers/osfstorage`;
    const folder = await ensureOsfFolder(token, nodeId, folderName);
    // A file's public-ish OSF location: the project's Files tab (osfstorage). We
    // don't get a per-file GUID page from WaterButler, so link to the folder view.
    const folderUrl = `https://osf.io/${nodeId}/files/osfstorage`;

    const results: MaterialUploadResult[] = [];
    for (const f of files) {
      try {
        let entity: OsfFileItem;
        if (f.existingOsfFileId) {
          // Known file → update to a new version.
          const res = await osfWbPut(
            token,
            `${provider}/${f.existingOsfFileId}?kind=file`,
            f.bytes,
            f.contentType,
          );
          if (res.status === 401) throw new OsfNotConnectedError();
          if (!res.ok) throw new Error(`update ${res.status} ${(await res.text()).slice(0, 300)}`);
          entity = ((await res.json()) as { data: OsfFileItem }).data;
        } else {
          // New file in the folder.
          const createUrl = `${provider}/${folder.pathId}?kind=file&name=${encodeURIComponent(f.fileName)}`;
          const res = await osfWbPut(token, createUrl, f.bytes, f.contentType);
          if (res.status === 401) throw new OsfNotConnectedError();
          if (res.status === 409) {
            // Same-named file already there and we didn't have its id — find + update.
            const existingId = folder.childrenHref
              ? osfPathId(
                  (await osfListFiles(token, folder.childrenHref)).find(
                    (i) => i.attributes?.kind === "file" && i.attributes?.name === f.fileName,
                  )?.attributes?.path,
                )
              : "";
            if (!existingId) {
              throw new Error(`a file named "${f.fileName}" already exists on OSF`);
            }
            const up = await osfWbPut(token, `${provider}/${existingId}?kind=file`, f.bytes, f.contentType);
            if (!up.ok) throw new Error(`update-after-409 ${up.status} ${(await up.text()).slice(0, 300)}`);
            entity = ((await up.json()) as { data: OsfFileItem }).data;
          } else if (!res.ok) {
            throw new Error(`create ${res.status} ${(await res.text()).slice(0, 300)}`);
          } else {
            entity = ((await res.json()) as { data: OsfFileItem }).data;
          }
        }
        results.push({
          artifactKey: f.artifactKey,
          fileName: f.fileName,
          status: "uploaded",
          osfFileId: osfPathId(entity?.attributes?.path) || f.existingOsfFileId || null,
          osfPath: entity?.attributes?.path ?? null,
          osfUrl: folderUrl,
        });
      } catch (e) {
        if (e instanceof OsfNotConnectedError) throw e; // auth failure aborts the batch
        results.push({
          artifactKey: f.artifactKey,
          fileName: f.fileName,
          status: "failed",
          osfFileId: f.existingOsfFileId ?? null,
          osfPath: null,
          osfUrl: null,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return results;
  },

  async listResources(userId, registrationId): Promise<LinkedResource[]> {
    const token = await osfAccessToken(userId);
    // The read route is nested under the registration; the WRITE routes are not
    // (see linkResource). GET /v2/resources/ — the bare collection — is 405.
    const rows = await osfApiList(token, `/registrations/${registrationId}/resources/`);
    return rows.map(toLinkedResource);
  },

  async linkResource(userId, { registrationId, resourceType, pid, description }): Promise<LinkedResource> {
    const token = await osfAccessToken(userId);
    const doi = normalizeDoi(pid);
    if (!doi) throw new Error("A DOI is required to link an output.");

    // 1. RECONCILE FIRST. `POST /v2/resources/` ignores every attribute and
    //    returns an empty draft, so a retry that blindly POSTs strands another
    //    invisible draft on the researcher's registration every time it runs
    //    (ADR-0103 D7). Adopt our own half-finished work instead.
    const existing = await osfApiList(token, `/registrations/${registrationId}/resources/`);
    const mine = existing
      .map(toLinkedResource)
      .find((r) => (r.pid === doi && r.resourceType === resourceType) || (r.pid === "" && !r.finalized));

    let resourceId = mine?.registryResourceId ?? "";

    if (!resourceId) {
      // 2. CREATE. The registration is named by a relationship, not an attribute:
      //    OSF's ResourceList reads `request.data['registration']` and 409s
      //    ("Cannot add Resources to a Registration that does not have a DOI") if
      //    the registration has no DOI of its own. Callers gate on that (D4).
      const created = await osfApi(token, "POST", "/resources/", {
        data: {
          type: "resources",
          relationships: { registration: { data: { id: registrationId, type: "registrations" } } },
        },
      });
      resourceId = String(created.data?.id ?? "");
      if (!resourceId) throw new Error("OSF created a resource without returning its id.");
    }

    // 3. CONTENT. Everything the POST discarded goes here.
    await osfApi(token, "PATCH", `/resources/${resourceId}/`, {
      data: {
        id: resourceId,
        type: "resources",
        attributes: {
          resource_type: resourceType,
          pid: doi,
          ...(description ? { description } : {}),
        },
      },
    });

    // 4. FINALIZE. Until this lands the resource exists but shows no badge, so it
    //    is NOT done. One-way: PATCHing finalized back to false is a 409.
    const done = await osfApi(token, "PATCH", `/resources/${resourceId}/`, {
      data: { id: resourceId, type: "resources", attributes: { finalized: true } },
    });

    const result = toLinkedResource(done.data as OsfResourceRow);
    // Trust OSF's echo over our intent, but don't report success on a resource it
    // says isn't finalized — that would be the "looks linked, shows no badge"
    // failure this sequence exists to prevent.
    if (!result.finalized) throw new Error("OSF accepted the output but did not finalize it — it will show no badge.");
    return { ...result, registryResourceId: resourceId, pid: result.pid || doi, resourceType: result.resourceType ?? resourceType };
  },

  async unlinkResource(userId, registryResourceId): Promise<void> {
    const token = await osfAccessToken(userId);
    await osfApi(token, "DELETE", `/resources/${registryResourceId}/`);
  },

  async mintNodeDoi(userId, nodeId): Promise<{ doi: string }> {
    const token = await osfAccessToken(userId);

    // Already minted? Return it. OSF raises "A DOI already exists for this
    // resource." on a second attempt, but that state is exactly what we wanted,
    // so it is a success, not an error (ADR-0103 D7's reconcile-don't-retry).
    const found = (await osfApiList(token, `/nodes/${nodeId}/identifiers/`)).find(
      (r) => (r.attributes as { category?: unknown } | undefined)?.category === "doi",
    );
    const existing = (found?.attributes as { value?: unknown } | undefined)?.value;
    if (typeof existing === "string" && existing) return { doi: normalizeDoi(existing) };

    // Make the node public FIRST — the mint requires it, and without this the
    // whole path is dead. OSF's IdentifierList carries `EditIfPublic`, which for
    // any non-safe method returns `obj.is_public` outright:
    //
    //   if request.method not in permissions.SAFE_METHODS: return obj.is_public
    //
    // We create every project private (`pushRegistration` step 2), so a mint on
    // an untouched node is refused — and refused as a bare
    // `403 "You do not have permission to perform this action."`, which names
    // neither public-ness nor the fix. Verified live 2026-07-16 against a node
    // this account owns as ADMIN. The token is not the problem: `osf.full_write`
    // composes FULL_WRITE → NODE_ALL_WRITE → NODE_METADATA_WRITE → IDENTIFIERS_WRITE.
    //
    // This is exactly what the consent already promises ("This makes your OSF
    // project public") — the promise simply had no code behind it. Doing it here
    // keeps the two inseparable: no caller can mint without publishing, and no
    // caller reaches here without consent (ADR-0104 D3).
    await osfApi(token, "PATCH", `/nodes/${nodeId}/`, {
      data: { id: nodeId, type: "nodes", attributes: { public: true } },
    });

    // Mint. `category` is the only writeable field — OSF assigns the value; we
    // cannot supply our own (ADR-0104: OSF is the registrant, not us). There is
    // NO delete route, so this is only ever reached behind explicit consent.
    const res = await osfApi(token, "POST", `/nodes/${nodeId}/identifiers/`, {
      data: { type: "identifiers", attributes: { category: "doi" } },
    });
    const value = (res.data?.attributes as { value?: unknown } | undefined)?.value;
    if (typeof value !== "string" || !value) throw new Error("OSF minted a DOI but did not return its value.");
    return { doi: normalizeDoi(value) };
  },

  /** Verified live 2026-07-16: `POST /v2/nodes/{parent}/children/` → 201 with the
   *  new guid, `category: "data"` accepted, and the `parent` relationship set to
   *  the parent. `GET /v2/nodes/{parent}/children/` lists it, and
   *  `DELETE /v2/nodes/{child}/` → 204 removes it cleanly — so an abandoned
   *  component is recoverable, unlike the DOI that may later name it. */
  async createComponent(userId, parentNodeId, input): Promise<{ nodeId: string }> {
    const token = await osfAccessToken(userId);
    const res = await osfApi(token, "POST", `/nodes/${parentNodeId}/children/`, {
      data: {
        type: "nodes",
        attributes: {
          title: input.title,
          category: input.category ?? "data",
          // Private at birth. `mintNodeDoi` publishes, and only behind consent.
          public: false,
        },
      },
    });
    const nodeId = res.data?.id;
    if (!nodeId) throw new Error("OSF created a component but did not return its id.");
    return { nodeId };
  },
};

/**
 * OSF's five public resource types. `ArtifactTypes.public_types()` in
 * osf/utils/outcomes.py, and the wire format is the enum member name lowercased
 * (api/base/serializers.py EnumField: `to_representation` → `.name.lower()`).
 * Verified against live data 2026-07-16: registration `pbu8x` carries
 * `resource_type: "data"` and `"analytic_code"`. OSF's UNDEFINED/PRIMARY are
 * internal and never appear here.
 */
const OSF_PUBLIC_RESOURCE_TYPES: readonly RegistryResourceType[] = [
  "data",
  "analytic_code",
  "materials",
  "papers",
  "supplements",
];

function asResourceType(v: unknown): RegistryResourceType | null {
  return typeof v === "string" && (OSF_PUBLIC_RESOURCE_TYPES as readonly string[]).includes(v)
    ? (v as RegistryResourceType)
    : null;
}

/** OSF normalises a DOI down to the bare value; mirror it so what we store and
 *  what we send agree, and a pasted `https://doi.org/10.x/y` doesn't round-trip
 *  as a different string than OSF holds. */
export function normalizeDoi(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:/i, "")
    .trim();
}

type OsfResourceRow = {
  id?: string;
  attributes?: { resource_type?: unknown; pid?: unknown; description?: unknown; finalized?: unknown };
};

function toLinkedResource(row: OsfResourceRow): LinkedResource {
  const a = row.attributes ?? {};
  return {
    registryResourceId: String(row.id ?? ""),
    resourceType: asResourceType(a.resource_type),
    pid: typeof a.pid === "string" ? a.pid : "",
    description: typeof a.description === "string" && a.description !== "" ? a.description : null,
    finalized: a.finalized === true,
  };
}

/** GET a JSON:API *collection*. `osfApi` is typed for a single resource; the
 *  resources + identifiers endpoints return arrays. */
async function osfApiList(token: string, path: string): Promise<OsfResourceRow[]> {
  const cfg = osfConfig();
  const res = await fetch(`${cfg.apiBase}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: JSON_API },
  });
  if (res.status === 401) {
    throw new OsfNotConnectedError(
      "OSF rejected the stored token (it may have been revoked or regenerated) — reconnect in Settings · Connections.",
    );
  }
  if (!res.ok) throw new Error(`OSF GET ${path} failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { data?: OsfResourceRow[] };
  return body.data ?? [];
}

/** Derive the OSF registration GUID from a DOI like "10.17605/OSF.IO/RXZQA" (or a bare guid). */
export function osfIdFromDoi(doi: string): string | null {
  const m = doi.match(/OSF\.IO\/(\w+)/i);
  if (m) return m[1].toLowerCase();
  return /^\w+$/.test(doi.trim()) ? doi.trim().toLowerCase() : null;
}
