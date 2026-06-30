"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";

import { REACTION_KEYS } from "@/lib/themes/themes";
import { aiChatTurn, type AiChatTurnResult } from "@/server/runtime/ai-chat";
import { recordScreenAnswers, startResponse } from "@/server/runtime/participant";
import { allowAnswer, allowBegin } from "@/server/runtime/take-rate-limit";

/**
 * Server actions for the participant runtime (ADR-0013/0028: advance via form
 * POST → server action → redirect). A screen submits answers for ALL its blocks
 * at once; each block's fields are namespaced by `${instanceId}__` on group
 * screens (and unprefixed on single screens).
 */

/** Consent → create/resume a response, then jump to the first screen. */
export async function beginAction(formData: FormData): Promise<void> {
  const studyId = String(formData.get("studyId") ?? "");
  const recruitmentSessionId = String(formData.get("recruitmentSessionId") ?? "");
  const mode = formData.get("mode") === "preview" ? "preview" : "run";
  const externalPid = (formData.get("externalPid") as string | null)?.trim() || null;

  if (mode === "run" && !(await allowBegin(recruitmentSessionId))) {
    redirect(`/take/${studyId}/throttled` as Route);
  }

  // Embedded data (ADR-0042): collect declared embedded_<name> hidden fields.
  const embedded: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("embedded_") && typeof v === "string" && v !== "") {
      embedded[k.slice("embedded_".length)] = v.slice(0, 500);
    }
  }
  const started = await startResponse({
    recruitmentSessionId,
    mode,
    externalPid,
    ...(Object.keys(embedded).length ? { embedded } : {}),
  });
  if ("error" in started) {
    redirect(`/take/${studyId}/start?closed=1`);
  }
  redirect(`/take/${studyId}/${started.responseId}/0`);
}

/** Build one block's answer shape from its (prefixed) form fields. The runtime
 *  re-validates server-side, so the client's moduleKey only selects extraction. */
function extractAnswer(moduleKey: string, prefix: string, fd: FormData): unknown {
  const g = (n: string) => fd.get(`${prefix}${n}`);
  const gAll = (n: string) => fd.getAll(`${prefix}${n}`);

  if (moduleKey === "ai-chat") {
    // The participant chat island mirrors the transcript into a hidden field.
    try {
      const parsed = JSON.parse(String(g("aichat") ?? "[]")) as unknown;
      const messages = Array.isArray(parsed)
        ? parsed
            .filter(
              (m): m is { role: "user" | "assistant"; content: string } =>
                !!m &&
                ((m as { role?: unknown }).role === "user" || (m as { role?: unknown }).role === "assistant") &&
                typeof (m as { content?: unknown }).content === "string",
            )
            .map((m) => ({ role: m.role, content: m.content.slice(0, 20000) }))
            .slice(0, 200)
        : [];
      return { messages };
    } catch {
      return { messages: [] };
    }
  }

  if (
    moduleKey === "likert-7" ||
    moduleKey === "slider" ||
    moduleKey === "number" ||
    moduleKey === "nps" ||
    moduleKey === "rating-stars" ||
    moduleKey === "vas" ||
    moduleKey === "reaction-time"
  ) {
    const raw = g("value");
    return raw != null && String(raw) !== "" ? { value: Number(raw) } : null;
  }
  if (
    moduleKey === "email" ||
    moduleKey === "url" ||
    moduleKey === "date" ||
    moduleKey === "yes-no" ||
    moduleKey === "dropdown" ||
    moduleKey === "phone"
  ) {
    return { value: String(g("value") ?? "") };
  }
  if (moduleKey === "address" || moduleKey === "contact" || moduleKey === "demographics") {
    const fields =
      moduleKey === "address"
        ? (["street", "city", "state", "postal", "country"] as const)
        : moduleKey === "contact"
          ? (["name", "email", "phone"] as const)
          : (["age", "gender", "country"] as const);
    const o: Record<string, string> = {};
    for (const f of fields) {
      const v = g(f);
      if (v != null && String(v).trim() !== "") o[f] = String(v);
    }
    return o;
  }
  if (moduleKey === "matrix-grid" || moduleKey === "semantic-differential") {
    const rowCount = Number(g("rowCount") ?? 0);
    const values: Record<string, string | number> = {};
    for (let i = 0; i < rowCount; i++) {
      const raw = g(`row_${i}`);
      if (raw != null && String(raw) !== "") {
        values[String(i)] = moduleKey === "semantic-differential" ? Number(raw) : String(raw);
      }
    }
    return { values };
  }
  if (moduleKey === "audio-record") {
    const r2Key = String(g("r2key") ?? "");
    if (!r2Key) return {}; // no recording → empty (required check applies)
    return { r2Key, durationMs: Number(g("durms")) || 0 };
  }
  if (moduleKey === "social-post") {
    // Engagement interactions (ADR-0024): always an object — exposure is
    // recorded even without interaction (liked/shared false). v1 social-post
    // blocks don't collect, so the runtime skips writing for them.
    const comment = String(g("comment") ?? "").trim();
    const single = g("reaction"); // legacy single-reaction mode posts liked/shared here
    // The seven-reaction picker (ADR-0085) posts the chosen key as `reactionKey`.
    const rk = g("reactionKey");
    const reaction = typeof rk === "string" && (REACTION_KEYS as readonly string[]).includes(rk) ? rk : null;
    // Participant replies to seeded comments (ADR-0085 amendment): each reply posts
    // its own `${prefix}reply` hidden input; collect them all.
    const replies = fd.getAll(`${prefix}reply`).map((v) => String(v).trim()).filter(Boolean);
    return {
      liked: g("liked") != null || single === "liked" || reaction != null,
      shared: g("shared") != null || single === "shared",
      ...(reaction ? { reaction } : {}),
      ...(comment ? { comment } : {}),
      ...(replies.length ? { replies } : {}),
    };
  }
  if (moduleKey === "file-upload") {
    const k = String(g("r2key") ?? "");
    const fn = String(g("filename") ?? "").trim();
    return k ? { r2Key: k, ...(fn ? { filename: fn } : {}) } : {};
  }
  if (moduleKey === "video-record") {
    const k = String(g("r2key") ?? "");
    return k ? { r2Key: k, durationMs: Number(g("durms")) || 0 } : {};
  }
  if (moduleKey === "heat-map") {
    try {
      const pts = JSON.parse(String(g("points") ?? "[]"));
      return { points: Array.isArray(pts) ? pts : [] };
    } catch {
      return { points: [] };
    }
  }
  if (moduleKey === "hot-spot") {
    try {
      const sel = JSON.parse(String(g("selected") ?? "[]"));
      const selected = Array.isArray(sel) ? sel.map(String) : [];
      // setValue action tags (ADR-0043) — re-validated server-side (default-deny
      // against declared setValue keys), so a forged tag is rejected.
      let tags: Record<string, string> | undefined;
      const rawTags = g("tags");
      if (rawTags) {
        const parsed = JSON.parse(String(rawTags));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const entries = Object.entries(parsed).filter(([, v]) => typeof v === "string");
          if (entries.length) tags = Object.fromEntries(entries) as Record<string, string>;
        }
      }
      return tags ? { selected, tags } : { selected };
    } catch {
      return { selected: [] };
    }
  }
  if (moduleKey === "graphic-slider") {
    const v = g("value");
    return v != null && String(v) !== "" ? { value: Number(v) } : {};
  }
  if (moduleKey === "signature") {
    const k = String(g("r2key") ?? "");
    return k ? { r2Key: k } : {};
  }
  if (moduleKey === "timed-exposure") {
    const v = g("shownMs");
    return { shownMs: v != null && String(v) !== "" ? Number(v) : 0 };
  }
  if (moduleKey === "forced-wait") {
    const v = g("waitedMs");
    return { waitedMs: v != null && String(v) !== "" ? Number(v) : 0 };
  }
  if (moduleKey === "accuracy-confidence") {
    const accuracy = String(g("accuracy") ?? "");
    const conf = g("confidence");
    return { accuracy, confidence: conf != null && String(conf) !== "" ? Number(conf) : 0 };
  }
  if (moduleKey === "share-intention") {
    const why = String(g("why") ?? "").trim();
    return { intention: String(g("intention") ?? ""), ...(why ? { why } : {}) };
  }
  if (moduleKey === "constant-sum") {
    // Hidden? No — items are cs_<i>; collect contiguous indices.
    const values: Record<string, number> = {};
    for (let i = 0; fd.has(`${prefix}cs_${i}`); i++) {
      const raw = g(`cs_${i}`);
      if (raw != null && String(raw) !== "") values[String(i)] = Number(raw);
    }
    return { values };
  }
  if (moduleKey === "drill-down") {
    const path: string[] = [];
    for (let i = 0; fd.has(`${prefix}drill_${i}`); i++) {
      const v = String(g(`drill_${i}`) ?? "");
      if (v) path.push(v);
    }
    return { path };
  }
  if (moduleKey === "side-by-side") {
    // Fields are sbs_<rowIndex>_<colKey>; collect all present.
    const values: Record<string, string> = {};
    for (const [name, val] of fd.entries()) {
      if (!name.startsWith(`${prefix}sbs_`)) continue;
      const cell = name.slice(`${prefix}sbs_`.length);
      const s = String(val);
      if (s !== "") values[cell] = s;
    }
    return { values };
  }
  if (moduleKey === "field-group") {
    // `fkeys` carries key:type pairs (ADR-0030); the runtime re-validates keys +
    // per-field formats against the block's config, so this only selects extraction.
    const values: Record<string, string | number> = {};
    for (const entry of String(g("fkeys") ?? "").split(",")) {
      const [key, type] = entry.split(":");
      if (!key) continue;
      const raw = g(`f_${key}`);
      if (raw == null || String(raw) === "") continue;
      values[key] = type === "number" ? Number(raw) : String(raw);
    }
    return { values };
  }
  if (moduleKey === "maxdiff") {
    return { best: String(g("best") ?? ""), worst: String(g("worst") ?? "") };
  }
  if (moduleKey === "multiple-choice" || moduleKey === "picture-choice") {
    return { selected: gAll("mc").map(String) };
  }
  if (moduleKey === "attention-check") {
    const raw = g("value");
    return { selected: raw != null && String(raw) !== "" ? [String(raw)] : [] };
  }
  if (moduleKey === "free-text") {
    return { text: String(g("text") ?? "") };
  }
  if (moduleKey === "ranking") {
    const pairs: { item: string; rank: number }[] = [];
    for (let i = 0; fd.has(`${prefix}item_${i}`); i++) {
      pairs.push({ item: String(g(`item_${i}`)), rank: Number(g(`rank_${i}`) ?? i + 1) });
    }
    pairs.sort((a, b) => a.rank - b.rank);
    return { order: pairs.map((p) => p.item) };
  }
  return null; // stimulus-only blocks record nothing
}

/** Record every block on the current screen, then advance (or complete). */
export async function answerAction(formData: FormData): Promise<void> {
  const studyId = String(formData.get("studyId") ?? "");
  const responseId = String(formData.get("responseId") ?? "");
  const screenIndex = Number(formData.get("questionIndex") ?? 0);

  if (!(await allowAnswer(responseId))) {
    redirect(`/take/${studyId}/${responseId}/${screenIndex}?e=throttled`);
  }

  // Each `blocks` entry is "instanceId|moduleKey|prefix".
  const answers: Record<string, unknown> = {};
  for (const d of formData.getAll("blocks").map(String)) {
    const [instanceId, moduleKey, prefix = ""] = d.split("|");
    if (!instanceId) continue;
    answers[instanceId] = extractAnswer(moduleKey, prefix, formData);
  }

  const result = await recordScreenAnswers({ responseId, screenIndex, answers });
  if (!result.ok) {
    redirect(`/take/${studyId}/${responseId}/${screenIndex}?e=${result.error}`);
  }
  if (result.done) {
    redirect(`/take/${studyId}/${responseId}/complete`);
  }
  redirect(`/take/${studyId}/${responseId}/${result.nextIndex}`);
}

/**
 * One assistant turn for an `ai-chat` block (ADR-0061). Called from the participant
 * chat UI (client) per message; returns the reply (no redirect). Rate-limited per
 * response (cost + abuse). The transcript is saved at the end via answerAction.
 */
export async function aiChatTurnAction(input: {
  responseId: string;
  blockInstanceId: string;
  history: { role: "user" | "assistant"; content: string }[];
  userMessage: string;
}): Promise<AiChatTurnResult> {
  if (!(await allowAnswer(input.responseId))) return { ok: false, error: "throttled" };
  const userMessage = input.userMessage.trim().slice(0, 5000);
  if (!userMessage) return { ok: false, error: "ai_error" };
  const history = (Array.isArray(input.history) ? input.history : [])
    .slice(-100)
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 20000) }));
  return aiChatTurn({
    responseId: input.responseId,
    blockInstanceId: input.blockInstanceId,
    history,
    userMessage,
  });
}
