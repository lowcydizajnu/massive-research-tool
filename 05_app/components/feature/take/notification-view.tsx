"use client";

import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { resolveNavTarget, resolveScreenHref, type NotificationCta } from "@/lib/take/nav-target";

/**
 * Notification stimulus (ADR-0095): an in-context notice with a type, up to two
 * CTAs, and an optional close. Records the action the participant took
 * (`dismissed` / `cta:<i>` / `ignored`) in hidden `${np}action` + `${np}atMs`
 * fields — never gates Continue. Trigger `after` reveals it on a client timer;
 * `on-load` and `conditional` render immediately (conditional's gating is the
 * block's own showIf/RevealGate, external to this component).
 */
type Variant = "error" | "warning" | "info" | "success" | "custom";

const VARIANT_STYLE: Record<Exclude<Variant, "custom">, { bg: string; fg: string; Icon: typeof Info; role: "alert" | "status" }> = {
  error: { bg: "var(--color-danger-subtle)", fg: "var(--color-danger-text-on-subtle)", Icon: CircleAlert, role: "alert" },
  warning: { bg: "var(--color-warning-subtle)", fg: "var(--color-warning-text-on-subtle)", Icon: TriangleAlert, role: "alert" },
  info: { bg: "var(--color-primary-subtle)", fg: "var(--color-primary-text-on-subtle)", Icon: Info, role: "status" },
  success: { bg: "var(--color-success-subtle)", fg: "var(--color-success-text-on-subtle)", Icon: CircleCheck, role: "status" },
};

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function NotificationView({
  config,
  np,
  preview = false,
}: {
  config: Record<string, unknown>;
  np: string;
  /** Builder live-preview: always shown (no trigger timer), CTAs + close inert. */
  preview?: boolean;
}) {
  const variant = (["error", "warning", "info", "success", "custom"].includes(str(config.variant)) ? config.variant : "info") as Variant;
  const title = str(config.title);
  const body = str(config.body);
  const thumbnailUrl = str(config.thumbnailUrl).trim();
  const thumbnailShape = str(config.thumbnailShape) === "square" ? "square" : "circle";
  const dismissable = config.dismissable !== false;
  const fixedTop = str(config.position) === "fixed-top";
  const triggerKind = str(config.triggerKind) || "on-load";
  const afterSec = typeof config.triggerAfterSec === "number" ? config.triggerAfterSec : 3;
  const ctas = (Array.isArray(config.ctas) ? config.ctas : []).slice(0, 2) as NotificationCta[];

  // `after` starts hidden and reveals on a timer; everything else shows at once.
  // In the Builder preview it's always shown (no timer).
  const [shown, setShown] = useState(preview || triggerKind !== "after");
  const [dismissed, setDismissed] = useState(false);
  const actionRef = useRef<HTMLInputElement>(null);
  const atMsRef = useRef<HTMLInputElement>(null);
  const start = useRef<number>(0);

  useEffect(() => {
    start.current = performance.now();
    if (preview || triggerKind !== "after") return;
    const t = setTimeout(() => setShown(true), Math.max(0, afterSec) * 1000);
    return () => clearTimeout(t);
  }, [preview, triggerKind, afterSec]);

  function record(action: string) {
    if (actionRef.current) actionRef.current.value = action;
    if (atMsRef.current) atMsRef.current.value = String(Math.round(performance.now() - start.current));
  }

  const custom = variant === "custom";
  const sty = custom ? null : VARIANT_STYLE[variant];
  const role = sty?.role ?? "status";
  const Icon = sty ? sty.Icon : Info;

  // Hidden fields always submit (default "ignored"); the notice may be hidden.
  // No form fields in the Builder preview (there's no take form there).
  const fields = preview ? null : (
    <>
      <input ref={actionRef} type="hidden" name={`${np}action`} defaultValue="ignored" />
      <input ref={atMsRef} type="hidden" name={`${np}atMs`} defaultValue="" />
    </>
  );

  if (!shown || dismissed) return <div className="hidden">{fields}</div>;

  // A notification is a TOP-OF-SCREEN element: `fixed-top` pins it as a full-width
  // OPAQUE banner at the very top of the take surface, above the content — no
  // matter where the block sits in the builder order. `inline` is a capped,
  // centered toast in the flow. The Builder preview never floats.
  const wrapperCls = fixedTop && !preview ? "fixed inset-x-0 top-0 z-50" : "mx-auto w-full max-w-md";
  const banner = fixedTop && !preview;
  // Opaque card (no content bleed-through) with a coloured left accent + icon.
  const accent = custom ? "var(--color-border-subtle)" : sty!.fg;

  return (
    <div className={wrapperCls}>
      {fields}
      <div
        role={role}
        className={
          "motion-safe:animate-in mx-auto flex w-full items-start gap-3 border-l-4 bg-[var(--color-surface-raised)] p-3 shadow-[var(--shadow-md)] " +
          (banner
            ? "max-w-3xl rounded-none border-b border-[var(--color-border-subtle)]"
            : "max-w-md rounded-[var(--radius-md)]")
        }
        style={{ borderLeftColor: accent }}
      >
        {custom ? (
          thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- researcher-supplied stimulus URL
            <img
              src={thumbnailUrl}
              alt=""
              className={`size-10 shrink-0 object-cover ${thumbnailShape === "circle" ? "rounded-full" : "rounded-[var(--radius-sm)]"}`}
            />
          ) : null
        ) : (
          <Icon className="mt-0.5 size-5 shrink-0" style={{ color: accent }} aria-hidden />
        )}

        <div className="min-w-0 flex-1">
          {title ? <p className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">{title}</p> : null}
          {body ? <p className="whitespace-pre-wrap text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{body}</p> : null}
          {ctas.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {ctas.map((cta, i) => {
                const label = str(cta.label) || "Open";
                const cls =
                  "rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2.5 py-1 text-[length:var(--text-small)] font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-subtle)]";
                if (preview) {
                  return <button key={i} type="button" className={cls}>{label}</button>;
                }
                // Same-study jump: navigate within the current take session.
                if (cta.targetKind === "screen") {
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
                const nav = resolveNavTarget(cta);
                if (!nav) {
                  return (
                    <button key={i} type="button" className={cls} onClick={() => record(`cta:${i}`)}>
                      {label}
                    </button>
                  );
                }
                return (
                  <a
                    key={i}
                    href={nav.href}
                    {...(nav.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className={cls}
                    onClick={() => record(`cta:${i}`)}
                  >
                    {label}
                  </a>
                );
              })}
            </div>
          ) : null}
        </div>

        {dismissable ? (
          <button
            type="button"
            aria-label="Dismiss notification"
            className="-m-1 shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)]"
            onClick={
              preview
                ? undefined
                : () => {
                    record("dismissed");
                    setDismissed(true);
                  }
            }
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}
