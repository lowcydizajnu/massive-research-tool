"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";

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

  const started = await startResponse({ recruitmentSessionId, mode, externalPid });
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
