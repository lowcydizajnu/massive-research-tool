import { createHmac, timingSafeEqual } from "node:crypto";

import {
  InvalidProviderTokenError,
  ProviderUnreachableError,
  type Eligibility,
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
  return res;
}

const PROLIFIC_TRANSITION: Record<"publish" | "pause" | "close", string> = {
  publish: "PUBLISH",
  pause: "PAUSE",
  close: "STOP",
};

/** Map our eligibility shape to Prolific's `eligibility_requirements` (P1b). Country/language only; everything else is set on the Prolific dashboard. */
function toEligibilityRequirements(e?: Eligibility): unknown[] {
  if (!e) return [];
  const reqs: unknown[] = [];
  if (e.country?.length) {
    reqs.push({
      type: "SelectAnswer",
      query: { id: "54ac6ea9fdf99b2204feb893", question: "In what country do you currently reside?" },
      attributes: e.country.map((iso) => ({ value: iso, index: -1 })),
    });
  }
  if (e.language?.length) {
    reqs.push({
      type: "SelectAnswer",
      query: { id: "languages", question: "Fluent languages" },
      attributes: e.language.map((iso) => ({ value: iso, index: -1 })),
    });
  }
  return reqs;
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
    const res = await call("/studies/", {
      accessToken,
      method: "POST",
      body: JSON.stringify({
        name: title,
        description,
        external_study_url: `${recruitmentUrl}?PROLIFIC_PID={{%PROLIFIC_PID%}}&SESSION_ID={{%SESSION_ID%}}`,
        prolific_id_option: "url_parameters",
        completion_code: "MRTDONE", // placeholder; refined in P2 with a verified completion redirect
        total_available_places: targetN,
        reward: Math.round(reward.amount * 100), // Prolific takes the smallest currency unit
        eligibility_requirements: toEligibilityRequirements(eligibility),
      }),
    });
    const study = (await res.json()) as { id: string };
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

  verifyWebhookSignature({ rawBody, signature }) {
    const secret = process.env.PROLIFIC_WEBHOOK_SECRET;
    if (!secret) return false;
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
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
