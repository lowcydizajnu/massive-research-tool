"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { resolveNavTarget, resolveScreenHref } from "@/lib/take/nav-target";

/**
 * Modal stimulus (ADR-0096): a centered dialog over a backdrop, focus-trapped,
 * with an optional image and up to two buttons that ADVANCE the study (close +
 * submit the current screen via the real Continue control) or STAY (close only)
 * or navigate (url/study/screen — reuses the CTA nav-target). Records the
 * participant's action in hidden `${np}action` + `${np}atMs` fields; never gates
 * Continue itself. In the Builder preview it renders inline + inert.
 */
type ModalCta = {
  label: string;
  action: "advance" | "stay" | "url" | "study" | "screen";
  targetUrl: string;
  targetStudyId: string;
  targetScreen: number;
};

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function ModalView({ config, np, preview = false }: { config: Record<string, unknown>; np: string; preview?: boolean }) {
  const title = str(config.title);
  const body = str(config.body);
  const imageUrl = str(config.imageUrl).trim();
  const imagePosition = (["top", "left", "right"].includes(str(config.imagePosition)) ? config.imagePosition : "none") as "none" | "top" | "left" | "right";
  const dismissable = config.dismissable !== false;
  const triggerKind = str(config.triggerKind) || "on-load";
  const afterSec = typeof config.triggerAfterSec === "number" ? config.triggerAfterSec : 3;
  const ctas = (Array.isArray(config.ctas) ? config.ctas : []).slice(0, 2) as ModalCta[];

  const [shown, setShown] = useState(preview || triggerKind !== "after");
  const [closed, setClosed] = useState(false);
  const actionRef = useRef<HTMLInputElement>(null);
  const atMsRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const start = useRef(0);
  const titleId = useId();

  useEffect(() => {
    start.current = performance.now();
    if (preview || triggerKind !== "after") return;
    const t = setTimeout(() => setShown(true), Math.max(0, afterSec) * 1000);
    return () => clearTimeout(t);
  }, [preview, triggerKind, afterSec]);

  // Move focus into the dialog on open (a11y). Not in preview (inline).
  useEffect(() => {
    if (!preview && shown && !closed) cardRef.current?.focus();
  }, [preview, shown, closed]);

  // Flag the body while open so the take page can hide the screen's own
  // Continue/Back row on a bare-modal screen (globals.css) — the modal drives the
  // flow; the row reappears on close so a dismissable modal never traps anyone.
  useEffect(() => {
    if (preview || typeof document === "undefined") return;
    if (shown && !closed) document.body.setAttribute("data-take-modal-open", "1");
    else document.body.removeAttribute("data-take-modal-open");
    return () => document.body.removeAttribute("data-take-modal-open");
  }, [preview, shown, closed]);

  function record(action: string) {
    if (actionRef.current) actionRef.current.value = action;
    if (atMsRef.current) atMsRef.current.value = String(Math.round(performance.now() - start.current));
  }
  function close(action: string) {
    record(action);
    setClosed(true);
  }
  function advance() {
    record("advance");
    setClosed(true);
    // Go to the next screen exactly as a normal Continue (branching, recording).
    (document.querySelector("[data-take-continue]") as HTMLButtonElement | null)?.click();
  }

  const fields = preview ? null : (
    <>
      <input ref={actionRef} type="hidden" name={`${np}action`} defaultValue="ignored" />
      <input ref={atMsRef} type="hidden" name={`${np}atMs`} defaultValue="" />
    </>
  );

  if (!shown || closed) return <div className="hidden">{fields}</div>;

  const img = imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- researcher-supplied stimulus URL
    <img
      src={imageUrl}
      alt=""
      className={
        imagePosition === "top"
          ? "max-h-52 w-full rounded-[var(--radius-md)] object-cover"
          : "max-h-40 w-32 shrink-0 rounded-[var(--radius-md)] object-cover"
      }
    />
  ) : null;

  const buttons = ctas.length ? (
    <div className="mt-1 flex flex-wrap justify-end gap-2">
      {ctas.map((cta, i) => {
        const label = str(cta.label) || "OK";
        const cls =
          "rounded-[var(--radius-md)] px-3 py-1.5 text-[length:var(--text-small)] font-medium " +
          (i === 0
            ? "bg-[var(--color-primary)] text-white hover:opacity-90"
            : "border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]");
        if (preview) return <button key={i} type="button" className={cls}>{label}</button>;
        if (cta.action === "advance") return <button key={i} type="button" className={cls} onClick={advance}>{label}</button>;
        if (cta.action === "stay") return <button key={i} type="button" className={cls} onClick={() => close(`cta:${i}`)}>{label}</button>;
        if (cta.action === "screen") {
          return (
            <button
              key={i}
              type="button"
              className={cls}
              onClick={() => {
                record(`cta:${i}`);
                const href = resolveScreenHref(window.location.pathname, cta.targetScreen);
                if (href) window.location.assign(href);
              }}
            >
              {label}
            </button>
          );
        }
        const nav = resolveNavTarget({ targetKind: cta.action, targetUrl: cta.targetUrl, targetStudyId: cta.targetStudyId });
        if (!nav) return <button key={i} type="button" className={cls} onClick={() => record(`cta:${i}`)}>{label}</button>;
        return (
          <a key={i} href={nav.href} {...(nav.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})} className={cls} onClick={() => record(`cta:${i}`)}>
            {label}
          </a>
        );
      })}
    </div>
  ) : null;

  const card = (
    <div
      ref={cardRef}
      role="dialog"
      aria-modal={!preview}
      aria-labelledby={title ? titleId : undefined}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape" && dismissable && !preview) close("dismissed");
      }}
      className="relative flex w-full max-w-md flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--color-surface-raised)] p-5 shadow-[var(--shadow-md)] outline-none"
    >
      {fields}
      {dismissable ? (
        <button
          type="button"
          aria-label="Close dialog"
          onClick={preview ? undefined : () => close("dismissed")}
          className="absolute right-3 top-3 rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)]"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}

      {imagePosition === "top" ? img : null}
      <div className={imagePosition === "left" || imagePosition === "right" ? "flex items-start gap-3" : "flex flex-col gap-2"}>
        {imagePosition === "left" ? img : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {title ? (
            <p id={titleId} className="pr-6 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
              {title}
            </p>
          ) : null}
          {body ? <p className="whitespace-pre-wrap text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{body}</p> : null}
        </div>
        {imagePosition === "right" ? img : null}
      </div>
      {buttons}
    </div>
  );

  // Preview: inline card (no backdrop/fixed). Runtime: a real centered overlay.
  if (preview) return <div className="mx-auto w-full max-w-md">{card}</div>;
  // The backdrop does NOT dismiss the modal (owner 2026-07-06) — only the ✕
  // (when dismissable), Esc, and the buttons close it. A stray click on the
  // dimmed area shouldn't drop a deliberate dialog.
  return (
    <div className="motion-safe:animate-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      {card}
    </div>
  );
}
