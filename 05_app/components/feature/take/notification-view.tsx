"use client";

import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { resolveNavTarget, resolveScreenHref, type NotificationCta } from "@/lib/take/nav-target";
import { beaconNotificationAction, clearCarry, registerLive, setCarry, unregisterLive } from "@/lib/take/notification-carry";

/**
 * Notification stimulus (ADR-0095): an in-context notice with a type, up to two
 * CTAs, and an optional close.
 *
 * Placement — a notification is a TOP-OF-SCREEN element, not an inline card. In
 * `banner` mode (default) it renders as a slim, full-width bar portaled into the
 * page-level `#take-topbar` slot, so it sits directly UNDER the fake nav and
 * above the content (never covering the nav), exactly like the interaction gate.
 * `inline` keeps it in the content flow for researchers who want that.
 *
 * Scope (ADR-0095 am. 2026-07-06) — `screen` shows it on its anchor screen only;
 * `persist` keeps it visible across subsequent screens until dismissed (the
 * anchor block writes a sessionStorage carry that {@link
 * ./persistent-notifications} re-renders on later screens). `persist` always
 * renders as a banner.
 *
 * Recording — the anchor block records the action the participant took
 * (`dismissed` / `cta:<i>` / `ignored`) in hidden `${np}action` + `${np}atMs`
 * fields; never gates Continue. `carried` (host) renders carry no form fields.
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
  carried = false,
  responseId = "",
  instanceId = "",
  screenIndex = 0,
  shownAt = 0,
}: {
  config: Record<string, unknown>;
  np: string;
  /** Builder live-preview: always shown (no trigger timer), CTAs + close inert. */
  preview?: boolean;
  /** Rendered by the persistent host on a LATER screen — always shown, no form
   *  fields; dismiss/CTA clears the carry AND beacons the action (ADR-0097). */
  carried?: boolean;
  /** Response id — needed to write/clear the cross-screen persist carry + beacon. */
  responseId?: string;
  /** Block instance id — carry key + live-registry key + beacon target. */
  instanceId?: string;
  /** 0-based index of the screen this instance is rendering on — for the beacon's
   *  1-based `screen`. Only meaningful in `carried` mode. */
  screenIndex?: number;
  /** Wall-clock ms when the notice first appeared (from the carry) — for the
   *  beacon's elapsed `atMs`. Only meaningful in `carried` mode. */
  shownAt?: number;
}) {
  const variant = (["error", "warning", "info", "success", "custom"].includes(str(config.variant)) ? config.variant : "info") as Variant;
  const title = str(config.title);
  const body = str(config.body);
  const thumbnailUrl = str(config.thumbnailUrl).trim();
  const thumbnailShape = str(config.thumbnailShape) === "square" ? "square" : "circle";
  const dismissable = config.dismissable !== false;
  const persist = str(config.scope) === "persist";
  // persist is always a banner; otherwise honour the researcher's placement.
  const banner = !preview && (persist || carried || str(config.position) === "fixed-top");
  const triggerKind = str(config.triggerKind) || "on-load";
  const afterSec = typeof config.triggerAfterSec === "number" ? config.triggerAfterSec : 3;
  const ctas = (Array.isArray(config.ctas) ? config.ctas : []).slice(0, 2) as NotificationCta[];

  // `after` starts hidden and reveals on a timer; everything else shows at once.
  // In the Builder preview and the carried host it's always shown (no timer).
  const [shown, setShown] = useState(preview || carried || triggerKind !== "after");
  const [dismissed, setDismissed] = useState(false);
  // Page-level top-bar slot (rendered by the take layout under the fake nav). Null
  // until mounted → the banner renders in place as a graceful fallback.
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const actionRef = useRef<HTMLInputElement>(null);
  const atMsRef = useRef<HTMLInputElement>(null);
  const start = useRef<number>(0);

  useEffect(() => {
    start.current = performance.now();
    if (banner) setSlot(document.getElementById("take-topbar"));
    if (preview || carried || triggerKind !== "after") return;
    const t = setTimeout(() => setShown(true), Math.max(0, afterSec) * 1000);
    return () => clearTimeout(t);
  }, [preview, carried, triggerKind, afterSec, banner]);

  // Anchor block, persist scope: claim the instance so the host skips it on THIS
  // screen (no double banner), and carry the config forward (with its first-shown
  // timestamp) while it's up.
  const anchorShownAt = useRef<number>(0);
  useEffect(() => {
    if (preview || carried || !persist || !responseId || !instanceId) return;
    registerLive(instanceId);
    if (shown && !dismissed) {
      if (!anchorShownAt.current) anchorShownAt.current = Date.now();
      setCarry(responseId, instanceId, config, anchorShownAt.current);
    }
    return () => unregisterLive(instanceId);
    // config is stable per render of a given block; re-run on shown/dismissed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, carried, persist, responseId, instanceId, shown, dismissed]);

  function record(action: string) {
    if (actionRef.current) actionRef.current.value = action;
    if (atMsRef.current) atMsRef.current.value = String(Math.round(performance.now() - start.current));
  }
  // A terminal action (dismiss / CTA). On the anchor screen the form fields carry
  // it; when this is the CARRIED render on a later screen, beacon it out-of-band
  // (ADR-0097) with the screen it happened on + elapsed time since first shown.
  function finishAction(action: string) {
    record(action);
    if (persist && responseId && instanceId) clearCarry(responseId, instanceId);
    if (carried && responseId && instanceId) {
      beaconNotificationAction({
        responseId,
        blockInstanceId: instanceId,
        action,
        atMs: shownAt ? Math.max(0, Math.round(Date.now() - shownAt)) : 0,
        screen: screenIndex + 1,
      });
    }
  }

  const custom = variant === "custom";
  const sty = custom ? null : VARIANT_STYLE[variant];
  const role = sty?.role ?? "status";
  const Icon = sty ? sty.Icon : Info;
  const accent = custom ? "var(--color-text-secondary)" : sty!.fg;

  // Hidden fields always submit (default "ignored"); the notice may be hidden.
  // No form fields in the Builder preview or the carried host (no take form there).
  const fields =
    preview || carried ? null : (
      <>
        <input ref={actionRef} type="hidden" name={`${np}action`} defaultValue="ignored" />
        <input ref={atMsRef} type="hidden" name={`${np}atMs`} defaultValue="" />
      </>
    );

  if (!shown || dismissed) return <div className="hidden">{fields}</div>;

  // Status shade (owner 2026-07-06): an OPAQUE variant tint — the subtle colour
  // layered over the opaque surface (background-color from the class), so it reads
  // as the status shade without letting scrolled-under content bleed through.
  const bgStyle = sty ? { backgroundImage: `linear-gradient(${sty.bg}, ${sty.bg})` } : undefined;

  const notice = (
    <div
      role={role}
      style={bgStyle}
      className={
        banner
          ? // Slim full-width bar under the nav; status-tinted, hairline bottom border.
            "motion-safe:animate-in w-full border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] shadow-[var(--shadow-sm)]"
          : // Inline: a capped, centered card in the content flow.
            "motion-safe:animate-in mx-auto flex w-full max-w-md items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-3 shadow-[var(--shadow-md)]"
      }
    >
      {/* Banner content aligns to the study content column (var set by the take
          layout) — same width as the content below, not full-bleed. */}
      <div className={banner ? "mx-auto flex w-full max-w-[var(--take-content-max,640px)] items-start gap-3 px-4 py-2.5" : "contents"}>
        {custom ? (
          thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- researcher-supplied stimulus URL
            <img
              src={thumbnailUrl}
              alt=""
              className={`size-9 shrink-0 object-cover ${thumbnailShape === "circle" ? "rounded-full" : "rounded-[var(--radius-sm)]"}`}
            />
          ) : (
            <Info className="mt-0.5 size-5 shrink-0" style={{ color: accent }} aria-hidden />
          )
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
                        finishAction(`cta:${i}`);
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
                    <button key={i} type="button" className={cls} onClick={() => finishAction(`cta:${i}`)}>
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
                    onClick={() => finishAction(`cta:${i}`)}
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
                    finishAction("dismissed");
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

  // Banner: render into the page top-bar slot (portal) so it spans the page under
  // the nav; fall back to in-place until the slot is mounted. Inline/preview: in place.
  if (banner) {
    return (
      <>
        {fields}
        {slot ? createPortal(notice, slot) : notice}
      </>
    );
  }
  return (
    <>
      {fields}
      {notice}
    </>
  );
}
