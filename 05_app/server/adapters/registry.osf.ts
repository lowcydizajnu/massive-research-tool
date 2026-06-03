import { and, eq, isNull } from "drizzle-orm";
import { ulid } from "ulid";

import { db } from "@/server/db/client";
import { registry as registryTable, registryConnection } from "@/server/db/schema";
import { encryptSecret } from "@/server/crypto/tokens";

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
 * The OAuth + connection methods are implemented here. The registration *push*
 * methods (pushRegistration/pushAmendment/withdraw) are intentionally
 * NOT_IMPLEMENTED — the push fires from the Preregister stage (step 3), where
 * the OSF registrations API + the JSON/PDF/template payload is built against
 * verified OSF docs rather than guessed here.
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
  };
}

/** Whether the OSF app is configured on this server (client id + redirect). */
export function isOsfConfigured(): boolean {
  const cfg = osfConfig();
  return !!cfg.clientId && !!cfg.redirectUri;
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

const NOT_IMPLEMENTED =
  "OSF registration push lands with the Preregister stage (step 3, ADR-0005) — " +
  "built against verified OSF registrations API, not stubbed here.";

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

  // Push fires from the Preregister stage (step 3); decryption of the stored
  // token happens there, inside this adapter, so plaintext never leaves it.
  async pushRegistration(_userId: string, _payload: RegistrationPayload): Promise<PushResult> {
    throw new Error(NOT_IMPLEMENTED);
  },
  async pushAmendment(): Promise<PushResult> {
    throw new Error(NOT_IMPLEMENTED);
  },
  async withdraw(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  },
};
