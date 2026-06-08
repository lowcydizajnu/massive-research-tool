"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";

import { recordAnswer, startResponse } from "@/server/runtime/participant";
import { allowAnswer, allowBegin } from "@/server/runtime/take-rate-limit";

/**
 * Server actions for the participant runtime (ADR-0013: advance via form POST →
 * server action → redirect, never a client router). These are the only mutating
 * entry points the public /take pages expose.
 */

/** Consent → create/resume a response, then jump to the first question. */
export async function beginAction(formData: FormData): Promise<void> {
  const studyId = String(formData.get("studyId") ?? "");
  const recruitmentSessionId = String(formData.get("recruitmentSessionId") ?? "");
  const mode = formData.get("mode") === "preview" ? "preview" : "run";
  const externalPid = (formData.get("externalPid") as string | null)?.trim() || null;

  // Rate-limit real runs (not the researcher's own preview replay) — security review #9.
  if (mode === "run" && !(await allowBegin(recruitmentSessionId))) {
    redirect(`/take/${studyId}/throttled` as Route);
  }

  const started = await startResponse({ recruitmentSessionId, mode, externalPid });
  if ("error" in started) {
    redirect(`/take/${studyId}/start?closed=1`);
  }
  redirect(`/take/${studyId}/${started.responseId}/0`);
}

/** Record the answer to the current question, then advance (or complete). */
export async function answerAction(formData: FormData): Promise<void> {
  const studyId = String(formData.get("studyId") ?? "");
  const responseId = String(formData.get("responseId") ?? "");
  const questionIndex = Number(formData.get("questionIndex") ?? 0);
  const moduleKey = String(formData.get("moduleKey") ?? "");

  // Cap answer submissions per response — a fuzzing loop trips this; a real
  // participant never does. Re-render the current question with a retry banner.
  if (!(await allowAnswer(responseId))) {
    redirect(`/take/${studyId}/${responseId}/${questionIndex}?e=throttled`);
  }

  // Build the module-specific answer shape from the form fields. recordAnswer
  // re-validates against the block's responseSchema server-side, so trusting
  // the client's moduleKey here only selects extraction, not correctness.
  let answer: unknown = null;
  if (moduleKey === "likert-7" || moduleKey === "slider" || moduleKey === "number") {
    const raw = formData.get("value");
    answer = raw != null && String(raw) !== "" ? { value: Number(raw) } : null;
  } else if (
    moduleKey === "email" ||
    moduleKey === "url" ||
    moduleKey === "date" ||
    moduleKey === "yes-no" ||
    moduleKey === "dropdown"
  ) {
    // V1.12 C2 — single string-value form blocks.
    answer = { value: String(formData.get("value") ?? "") };
  } else if (moduleKey === "multiple-choice") {
    answer = { selected: formData.getAll("mc").map(String) };
  } else if (moduleKey === "attention-check") {
    const raw = formData.get("value");
    answer = { selected: raw != null && String(raw) !== "" ? [String(raw)] : [] };
  } else if (moduleKey === "free-text") {
    answer = { text: String(formData.get("text") ?? "") };
  } else if (moduleKey === "ranking") {
    // Pair each item with its chosen rank, then order by rank (ties → input order).
    const pairs: { item: string; rank: number }[] = [];
    for (let i = 0; formData.has(`item_${i}`); i++) {
      pairs.push({
        item: String(formData.get(`item_${i}`)),
        rank: Number(formData.get(`rank_${i}`) ?? i + 1),
      });
    }
    pairs.sort((a, b) => a.rank - b.rank);
    answer = { order: pairs.map((p) => p.item) };
  } else if (moduleKey === "demographics") {
    const o: Record<string, string> = {};
    for (const f of ["age", "gender", "country"] as const) {
      const v = formData.get(f);
      if (v != null && String(v).trim() !== "") o[f] = String(v);
    }
    answer = o;
  }

  const result = await recordAnswer({ responseId, questionIndex, answer });
  if (!result.ok) {
    redirect(`/take/${studyId}/${responseId}/${questionIndex}?e=${result.error}`);
  }
  if (result.done) {
    redirect(`/take/${studyId}/${responseId}/complete`);
  }
  redirect(`/take/${studyId}/${responseId}/${result.nextIndex}`);
}
