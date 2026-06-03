"use server";

import { redirect } from "next/navigation";

import { recordAnswer, startResponse } from "@/server/runtime/participant";

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

  // Build the module-specific answer shape from the form fields. recordAnswer
  // re-validates against the block's responseSchema server-side, so trusting
  // the client's moduleKey here only selects extraction, not correctness.
  let answer: unknown = null;
  if (moduleKey === "likert-7") {
    const raw = formData.get("value");
    answer = raw != null && String(raw) !== "" ? { value: Number(raw) } : null;
  } else if (moduleKey === "multiple-choice") {
    answer = { selected: formData.getAll("mc").map(String) };
  } else if (moduleKey === "free-text") {
    answer = { text: String(formData.get("text") ?? "") };
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
