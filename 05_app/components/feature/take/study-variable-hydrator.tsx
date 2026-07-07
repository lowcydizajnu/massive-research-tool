"use client";

import { useEffect } from "react";

import { getVars, interpolate, subscribeVars } from "@/lib/take/study-variables";

/**
 * Study-variable token hydrator (ADR-0099). Resolves `{name}` tokens in the
 * rendered participant DOM from the client-only study-variable carry — so a
 * researcher can drop `{username}` into notification / modal text OR any block
 * prompt and it fills in with the value the participant entered at login. Runs on
 * the client only; the value never touches the server.
 *
 * One mechanism covers every surface (messages + blocks) uniformly, so the block
 * renderers stay untouched. It walks text nodes under `document.body` (the take
 * route renders only participant chrome there), skipping form controls,
 * `<script>` / `<style>`, and any `[data-no-vars]` subtree (e.g. the signed-in
 * bar, which interpolates itself). A `MutationObserver` re-applies after React
 * re-renders (a client component reverting its text to the raw token), and the
 * replacement only touches KNOWN tokens, so unrelated braces are never altered.
 * Text is written via node `data` (never innerHTML), so a value can't inject HTML.
 */
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "SELECT", "OPTION"]);

function shouldSkip(node: Node): boolean {
  let el: Node | null = node.parentNode;
  while (el && el.nodeType === 1) {
    const e = el as HTMLElement;
    if (SKIP_TAGS.has(e.tagName) || e.hasAttribute("data-no-vars")) return true;
    el = e.parentNode;
  }
  return false;
}

export function StudyVariableHydrator({ responseId }: { responseId: string }) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.body;
    let observer: MutationObserver | null = null;

    const apply = () => {
      const vars = getVars(responseId);
      if (Object.keys(vars).length === 0) return; // nothing to resolve yet (pre-login)
      // Detach while mutating so our own text writes don't re-trigger the observer.
      observer?.disconnect();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n: Node | null = walker.nextNode();
      while (n) {
        const data = n.nodeValue ?? "";
        if (data.indexOf("{") !== -1 && !shouldSkip(n)) {
          const next = interpolate(data, vars);
          if (next !== data) n.nodeValue = next;
        }
        n = walker.nextNode();
      }
      observer?.observe(root, { childList: true, subtree: true, characterData: true });
    };

    // Re-apply when React commits new/updated text (e.g. an after-delay
    // notification mounts, or a client component re-renders its token back).
    observer = new MutationObserver(() => apply());
    apply();
    const unsub = subscribeVars(apply);
    return () => {
      observer?.disconnect();
      observer = null;
      unsub();
    };
  }, [responseId]);

  return null;
}
