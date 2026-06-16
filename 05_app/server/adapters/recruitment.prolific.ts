import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { LANGUAGES, PROLIFIC_COUNTRIES } from "@/lib/iso-countries";
import {
  InvalidProviderTokenError,
  ProviderUnreachableError,
  type Eligibility,
  type ProviderStudyState,
  type ProviderSubmission,
  type RecruitmentAdapter,
} from "./recruitment";

/**
 * Prolific implementation of `RecruitmentAdapter` (ADR-0047). The ONLY file that
 * talks to the Prolific API — vendor isolation per ADR-0007; the lock-in
 * inventory gets a Prolific row. PAT-first: the researcher pastes a Personal
 * Access Token (Connections sub-view); OAuth is not required for V1.15.0.
 *
 * Returns NO participant PII (ADR-0014): `ProviderSubmission` carries only the
 * opaque `externalPid` + status + timestamps.
 *
 * NOTE (vendor-shape, owner verifies on the live test): Prolific PATs use the
 * `Authorization: Token <pat>` scheme. If the live test 401s, flip AUTH_SCHEME
 * to "Bearer" — the only header detail in question. Endpoints + payload shapes
 * are exercised from Stream P2; Stream P1 only calls `validateToken`.
 */
const API_BASE = process.env.PROLIFIC_API_BASE ?? "https://api.prolific.com/api/v1";
const AUTH_SCHEME = "Token"; // Prolific PAT scheme; flip to "Bearer" only if a live PAT 401s.

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `${AUTH_SCHEME} ${accessToken}`, "Content-Type": "application/json" };
}

/** One fetch with provider-vs-token error discrimination (ADR-0047 §error semantics). */
async function call(
  path: string,
  init: RequestInit & { accessToken: string },
): Promise<Response> {
  const { accessToken, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...rest,
      headers: { ...authHeaders(accessToken), ...(headers as Record<string, string> | undefined) },
    });
  } catch {
    // Network/DNS/timeout — the provider is unreachable, NOT a bad token.
    throw new ProviderUnreachableError();
  }
  if (res.status === 401 || res.status === 403) throw new InvalidProviderTokenError();
  if (res.status >= 500) throw new ProviderUnreachableError();
  // Any other non-2xx (400/404/422 — validation errors) must SURFACE, not pass
  // through as a fake success. Include Prolific's error body so the cause is visible.
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Prolific ${res.status}: ${body.slice(0, 500) || res.statusText}`);
  }
  return res;
}

const PROLIFIC_TRANSITION: Record<"publish" | "pause" | "close", string> = {
  publish: "PUBLISH",
  pause: "PAUSE",
  close: "STOP",
};

const COUNTRY_FILTER = "current-country-of-residence";
const LANGUAGE_FILTER = "fluent-languages";
const COUNTRY_NAME = new Map(PROLIFIC_COUNTRIES.map((c) => [c.code, c.name.toLowerCase()]));
const LANGUAGE_NAME = new Map(LANGUAGES.map((l) => [l.code, l.name.toLowerCase()]));

type ProlificFilter = {
  id?: string;
  filter_id?: string;
  choices?: Array<{ value?: string; id?: string; label?: string }> | Record<string, string>;
};

/**
 * Prolific's `current-country-of-residence` / `fluent-languages` are ChoiceID
 * filters: `selected_values` must be numeric-string ChoiceIDs, not ISO codes
 * (error 140003). Fetch the filter definitions and build label→ChoiceID maps for
 * the two filters we surface; we then match our country/language NAMES to
 * Prolific's choice labels. Handles both choices shapes (array of {value,label}
 * or object {ChoiceID: label}).
 */
async function fetchChoiceMaps(accessToken: string): Promise<Map<string, Map<string, string>>> {
  const res = await call("/filters/", { accessToken, method: "GET" });
  const body = (await res.json()) as { results?: ProlificFilter[] } | ProlificFilter[];
  const filters = Array.isArray(body) ? body : (body.results ?? []);
  const out = new Map<string, Map<string, string>>();
  for (const f of filters) {
    const id = f.filter_id ?? f.id;
    if (id !== COUNTRY_FILTER && id !== LANGUAGE_FILTER) continue;
    const choiceMap = new Map<string, string>();
    const raw = f.choices;
    if (Array.isArray(raw)) {
      for (const c of raw) {
        const value = String(c.value ?? c.id ?? "");
        const label = String(c.label ?? c.value ?? "").toLowerCase();
        if (value && label) choiceMap.set(label, value);
      }
    } else if (raw && typeof raw === "object") {
      for (const [cid, label] of Object.entries(raw)) choiceMap.set(String(label).toLowerCase(), String(cid));
    }
    out.set(id, choiceMap);
  }
  return out;
}

/**
 * Build Prolific `filters` from our eligibility (P1b), mapping our country/
 * language names → Prolific ChoiceIDs. Empty when nothing's selected (no extra
 * fetch). A selected country/language that doesn't map is dropped (best-effort),
 * so a single unknown name never 400s the whole create.
 */
async function buildFilters(accessToken: string, e?: Eligibility): Promise<unknown[]> {
  if (!e || (!e.country?.length && !e.language?.length)) return [];
  const maps = await fetchChoiceMaps(accessToken);
  const mapCodes = (codes: string[], names: Map<string, string>, choices?: Map<string, string>) =>
    codes.map((code) => choices?.get(names.get(code) ?? code.toLowerCase())).filter((v): v is string => !!v);
  const filters: unknown[] = [];
  if (e.country?.length) {
    const ids = mapCodes(e.country, COUNTRY_NAME, maps.get(COUNTRY_FILTER));
    if (ids.length) filters.push({ filter_id: COUNTRY_FILTER, selected_values: ids });
  }
  if (e.language?.length) {
    const ids = mapCodes(e.language, LANGUAGE_NAME, maps.get(LANGUAGE_FILTER));
    if (ids.length) filters.push({ filter_id: LANGUAGE_FILTER, selected_values: ids });
  }
  return filters;
}

export const prolificAdapter: RecruitmentAdapter = {
  async validateToken({ accessToken }) {
    const res = await call("/users/me/", { accessToken, method: "GET" });
    if (!res.ok) throw new InvalidProviderTokenError();
    const me = (await res.json()) as { id?: string };
    if (!me?.id) throw new InvalidProviderTokenError();
    return { providerUserId: me.id };
  },

  async disconnect() {
    // Prolific PATs can't be revoked via the API; disconnect is local-only
    // (we delete our encrypted copy). No-op provider-side.
  },

  async createStudy({ accessToken, title, description, recruitmentUrl, targetN, reward, eligibility }) {
    const completionCode = `MRT${randomBytes(4).toString("hex").toUpperCase()}`;
    const res = await call("/studies/", {
      accessToken,
      method: "POST",
      body: JSON.stringify({
        name: title,
        description: description || title,
        external_study_url: `${recruitmentUrl}?PROLIFIC_PID={{%PROLIFIC_PID%}}&SESSION_ID={{%SESSION_ID%}}`,
        prolific_id_option: "url_parameters",
        // Current Prolific API: completion_codes (array), not the legacy single completion_code.
        completion_codes: [{ code: completionCode, code_type: "COMPLETED", actions: [{ action: "MANUALLY_REVIEW" }] }],
        total_available_places: targetN,
        estimated_completion_time: 5, // minutes; Prolific requires a positive estimate. Refined in P2.
        reward: Math.round(reward.amount * 100), // smallest currency unit
        filters: await buildFilters(accessToken, eligibility), // ChoiceID filters (eligibility_requirements is deprecated)
      }),
    });
    const study = (await res.json()) as { id?: string };
    if (!study?.id) {
      throw new Error(`Prolific create returned no study id — response: ${JSON.stringify(study).slice(0, 400)}`);
    }
    return { providerStudyId: study.id, providerStudyUrl: `https://app.prolific.com/researcher/studies/${study.id}` };
  },

  async publishStudy({ accessToken, providerStudyId }) {
    await call(`/studies/${providerStudyId}/transition/`, {
      accessToken,
      method: "POST",
      body: JSON.stringify({ action: PROLIFIC_TRANSITION.publish }),
    });
  },
  async pauseStudy({ accessToken, providerStudyId }) {
    await call(`/studies/${providerStudyId}/transition/`, {
      accessToken,
      method: "POST",
      body: JSON.stringify({ action: PROLIFIC_TRANSITION.pause }),
    });
  },
  async closeStudy({ accessToken, providerStudyId }) {
    await call(`/studies/${providerStudyId}/transition/`, {
      accessToken,
      method: "POST",
      body: JSON.stringify({ action: PROLIFIC_TRANSITION.close }),
    });
  },

  async getStudy({ accessToken, providerStudyId }) {
    const res = await call(`/studies/${providerStudyId}/`, { accessToken, method: "GET" });
    const s = (await res.json()) as {
      status?: string;
      total_available_places?: number;
      places_taken?: number;
      number_of_submissions?: number;
    };
    return {
      state: mapStudyState(s.status),
      placesTaken: s.places_taken ?? s.number_of_submissions ?? 0,
      totalPlaces: s.total_available_places ?? 0,
    };
  },

  async listSubmissions({ accessToken, providerStudyId }) {
    const res = await call(`/studies/${providerStudyId}/submissions/`, { accessToken, method: "GET" });
    const body = (await res.json()) as { results?: ProlificSubmission[] };
    return (body.results ?? []).map(mapSubmission);
  },
  async approveSubmission({ accessToken, submissionId }) {
    await call(`/submissions/${submissionId}/transition/`, {
      accessToken,
      method: "POST",
      body: JSON.stringify({ action: "APPROVE" }),
    });
  },
  async rejectSubmission({ accessToken, submissionId, reason }) {
    await call(`/submissions/${submissionId}/transition/`, {
      accessToken,
      method: "POST",
      body: JSON.stringify({ action: "REJECT", message: reason }),
    });
  },
  async sendBonus({ accessToken, submissionId, amount, reason }) {
    await call(`/submissions/${submissionId}/bonus-payments/`, {
      accessToken,
      method: "POST",
      body: JSON.stringify({ amount: Math.round(amount * 100), reason }),
    });
  },

  async listProviderWorkspaces({ accessToken }) {
    const res = await call("/workspaces/", { accessToken, method: "GET" });
    const body = (await res.json()) as { results?: Array<{ id?: string; title?: string }> };
    return (body.results ?? [])
      .filter((w): w is { id: string; title?: string } => typeof w.id === "string")
      .map((w) => ({ id: w.id, title: w.title ?? "Workspace" }));
  },

  async createWebhookSecret({ accessToken, workspaceId }) {
    const res = await call("/hooks/secrets/", {
      accessToken,
      method: "POST",
      body: JSON.stringify({ workspace_id: workspaceId }),
    });
    const body = (await res.json()) as { secret?: string };
    if (!body.secret) throw new Error("Prolific did not return a webhook secret.");
    return { secret: body.secret };
  },

  async listWebhookEventTypes({ accessToken }) {
    const res = await call("/hooks/event-types", { accessToken, method: "GET" });
    const body = (await res.json()) as { results?: Array<{ event_type?: string; id?: string }> } | string[];
    if (Array.isArray(body)) return body.filter((s): s is string => typeof s === "string");
    return (body.results ?? []).map((r) => r.event_type ?? r.id ?? "").filter(Boolean);
  },

  async createWebhookSubscription({ accessToken, workspaceId, eventType, targetUrl }) {
    const res = await call("/hooks/subscriptions/", {
      accessToken,
      method: "POST",
      body: JSON.stringify({ workspace_id: workspaceId, event_type: eventType, target_url: targetUrl }),
    });
    const body = (await res.json()) as { id?: string };
    // The confirmation token comes back in the X-Hook-Secret header.
    const confirmationToken = res.headers.get("x-hook-secret") ?? res.headers.get("X-Hook-Secret") ?? "";
    if (!body.id) throw new Error("Prolific did not return a subscription id.");
    return { subscriptionId: body.id, confirmationToken };
  },

  async confirmWebhookSubscription({ accessToken, subscriptionId, confirmationToken }) {
    await call(`/hooks/subscriptions/${subscriptionId}`, {
      accessToken,
      method: "POST",
      body: JSON.stringify({ secret: confirmationToken }),
    });
  },

  async deleteWebhookSubscription({ accessToken, subscriptionId }) {
    await call(`/hooks/subscriptions/${subscriptionId}`, { accessToken, method: "DELETE" });
  },

  verifyWebhookSignature({ rawBody, timestamp, signature, secret }) {
    if (!secret || !signature || !timestamp) return false;
    // HMAC-SHA256 over (timestamp + rawBody) with the per-workspace secret, base64.
    const expected = createHmac("sha256", secret).update(timestamp + rawBody).digest("base64");
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  },
};

type ProlificSubmission = {
  id: string;
  participant: string; // opaque Prolific PID — the ONLY identifier we read
  status: string;
  started_at?: string;
  completed_at?: string;
};

/** Prolific study `status` string → our normalized lifecycle state. */
function mapStudyState(status?: string): ProviderStudyState {
  switch ((status ?? "").toUpperCase().replace(/\s+/g, "_")) {
    case "UNPUBLISHED":
    case "SCHEDULED":
      return "unpublished";
    case "ACTIVE":
      return "active";
    case "PAUSED":
      return "paused";
    case "AWAITING_REVIEW":
      return "awaiting_review";
    case "COMPLETED":
      return "completed";
    default:
      return "unknown";
  }
}

function mapSubmission(s: ProlificSubmission): ProviderSubmission {
  const status: ProviderSubmission["status"] =
    s.status === "ACTIVE"
      ? "started"
      : s.status === "AWAITING REVIEW" || s.status === "COMPLETED"
        ? "submitted"
        : s.status === "APPROVED"
          ? "approved"
          : s.status === "REJECTED"
            ? "rejected"
            : "timed-out";
  return {
    submissionId: s.id,
    externalPid: s.participant,
    status,
    startedAt: s.started_at ? new Date(s.started_at) : new Date(0),
    completedAt: s.completed_at ? new Date(s.completed_at) : undefined,
  };
}
