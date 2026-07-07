"use client";

import { useState } from "react";

import { PickFromMaterialsButton } from "@/components/feature/builder/pick-from-materials-button";
import { UploadButton } from "@/components/feature/builder/upload-button";
import { LoginView } from "@/components/feature/take/login-view";
import type { StudyBlock } from "@/server/trpc/routers/studies";

/**
 * Configure panel for the Login-screen block (ADR-0098) — a live-preview editor
 * in the spirit of the notification / modal editors. Commits the whole config via
 * onChange. A login imitating a real product is deception, so it carries the same
 * IRB attestation the study needs before it can go live. NOTE: the participant's
 * typed username/password are NEVER recorded — this panel only styles the screen.
 */
const labelCls = "text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]";
const fieldCls =
  "rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1.5 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

const SSO = [
  { value: "google", label: "Google" },
  { value: "facebook", label: "Facebook" },
  { value: "apple", label: "Apple" },
  { value: "microsoft", label: "Microsoft" },
  { value: "x", label: "X" },
  { value: "generic", label: "Generic SSO" },
] as const;

type Cfg = {
  brandKind: "generic" | "custom";
  brandName: string;
  brandLogoUrl: string;
  title: string;
  subtitle: string;
  usernameLabel: string;
  usernamePlaceholder: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  submitLabel: string;
  ssoProviders: string[];
  showForgot: boolean;
  showSignup: boolean;
  triggerKind: "on-load" | "after" | "conditional";
  triggerAfterSec: number;
  captureUsername: boolean;
  usernameVar: string;
  showSignedInBar: boolean;
  signedInTemplate: string;
  imitatesReal: boolean;
  deceptionAck: boolean;
};

export function LoginConfig({
  block,
  onChange,
  onRename,
  onRemove,
}: {
  block: StudyBlock;
  onChange: (config: Record<string, unknown>) => void;
  onRename?: (title: string) => void;
  onRemove: () => void;
}) {
  const init = block.config as Partial<Cfg>;
  const [cfg, setCfg] = useState<Cfg>({
    brandKind: init.brandKind ?? "generic",
    brandName: init.brandName ?? "",
    brandLogoUrl: init.brandLogoUrl ?? "",
    title: init.title ?? "",
    subtitle: init.subtitle ?? "",
    usernameLabel: init.usernameLabel ?? "Email or username",
    usernamePlaceholder: init.usernamePlaceholder ?? "",
    passwordLabel: init.passwordLabel ?? "Password",
    passwordPlaceholder: init.passwordPlaceholder ?? "",
    submitLabel: init.submitLabel ?? "Sign in",
    ssoProviders: Array.isArray(init.ssoProviders) ? init.ssoProviders.map(String) : [],
    showForgot: init.showForgot !== false,
    showSignup: init.showSignup !== false,
    triggerKind: init.triggerKind ?? "on-load",
    triggerAfterSec: typeof init.triggerAfterSec === "number" ? init.triggerAfterSec : 3,
    captureUsername: init.captureUsername !== false,
    usernameVar: init.usernameVar ?? "username",
    showSignedInBar: init.showSignedInBar !== false,
    signedInTemplate: init.signedInTemplate ?? "Signed in as {username}",
    imitatesReal: init.imitatesReal !== false,
    deceptionAck: init.deceptionAck === true,
  });
  const [title, setTitle] = useState(block.title ?? "");
  const set = (patch: Partial<Cfg>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    onChange(next);
  };
  const toggleSso = (value: string) =>
    set({ ssoProviders: cfg.ssoProviders.includes(value) ? cfg.ssoProviders.filter((p) => p !== value) : [...cfg.ssoProviders, value] });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className={labelCls}>Block title</span>
        <input
          value={title}
          placeholder={block.name}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() !== (block.title ?? "") && onRename?.(title.trim())}
          className={`${fieldCls} font-serif font-medium`}
        />
        <p className="font-mono text-[length:var(--text-mono)] text-[var(--color-text-muted)]">{block.key} · {block.version}</p>
      </div>

      <div className="flex flex-col gap-1">
        <span className={labelCls}>Preview</span>
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3">
          <LoginView config={cfg} np="" preview />
        </div>
      </div>

      <p className="rounded-[var(--radius-md)] bg-[var(--color-primary-subtle)] p-3 text-[length:var(--text-small)] text-[var(--color-primary-text-on-subtle)]">
        Privacy: what the participant types is <strong>never recorded or exported</strong> — your data has only their action
        (sign-in / SSO / ignored), its timing, and a <strong>1/0 “Username” column</strong> (did they type one). The password is never
        captured. If you turn on “Reuse the username” below, the value is kept <strong>only in the participant’s browser for this run</strong>
        (to personalise later screens) and still never reaches your data.
      </p>

      {/* Brand */}
      <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3">
        <span className={labelCls}>Brand</span>
        <input value={cfg.brandName} placeholder="Brand name (e.g. your service)" onChange={(e) => set({ brandName: e.target.value, brandKind: "custom" })} className={fieldCls} />
        <span className="flex flex-wrap gap-1.5">
          <UploadButton kind="image" label="Upload logo…" onUploaded={(url) => set({ brandLogoUrl: url, brandKind: "custom" })} />
          <PickFromMaterialsButton kind="image" onPick={(url) => set({ brandLogoUrl: url, brandKind: "custom" })} />
        </span>
      </div>

      <label className="flex flex-col gap-1">
        <span className={labelCls}>Title</span>
        <input value={cfg.title} maxLength={120} placeholder="Sign in to continue" onChange={(e) => set({ title: e.target.value })} className={fieldCls} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelCls}>Subtitle</span>
        <input value={cfg.subtitle} maxLength={160} onChange={(e) => set({ subtitle: e.target.value })} className={fieldCls} />
      </label>

      {/* Fields */}
      <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3">
        <span className={labelCls}>Fields</span>
        <input value={cfg.usernameLabel} placeholder="Username label" onChange={(e) => set({ usernameLabel: e.target.value })} className={fieldCls} />
        <input value={cfg.usernamePlaceholder} placeholder="Username placeholder" onChange={(e) => set({ usernamePlaceholder: e.target.value })} className={fieldCls} />
        <input value={cfg.passwordLabel} placeholder="Password label" onChange={(e) => set({ passwordLabel: e.target.value })} className={fieldCls} />
        <input value={cfg.passwordPlaceholder} placeholder="Password placeholder" onChange={(e) => set({ passwordPlaceholder: e.target.value })} className={fieldCls} />
        <input value={cfg.submitLabel} placeholder="Sign-in button label" onChange={(e) => set({ submitLabel: e.target.value })} className={fieldCls} />
      </div>

      {/* SSO */}
      <div className="flex flex-col gap-2">
        <span className={labelCls}>Single sign-on buttons</span>
        <div className="flex flex-wrap gap-1.5">
          {SSO.map((p) => {
            const on = cfg.ssoProviders.includes(p.value);
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => toggleSso(p.value)}
                className={
                  "rounded-[var(--radius-md)] border px-2.5 py-1 text-[length:var(--text-small)] font-medium " +
                  (on
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
                    : "border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]")
                }
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Personalisation — reuse the typed username as a study variable (ADR-0099).
          Client-only: the value never reaches the server / DB / export. */}
      <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3">
        <span className={labelCls}>Personalisation</span>
        <label className="flex items-center gap-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]">
          <input type="checkbox" checked={cfg.captureUsername} onChange={(e) => set({ captureUsername: e.target.checked })} className="size-4 accent-[var(--color-primary)]" />
          Reuse the typed username later in this run
        </label>
        {cfg.captureUsername ? (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                Variable name — reference it as <code className="font-mono">{`{${(cfg.usernameVar || "username").trim() || "username"}}`}</code> in any text
              </span>
              <input
                value={cfg.usernameVar}
                placeholder="username"
                onChange={(e) => set({ usernameVar: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") })}
                className={fieldCls}
              />
            </label>
            <label className="flex items-center gap-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]">
              <input type="checkbox" checked={cfg.showSignedInBar} onChange={(e) => set({ showSignedInBar: e.target.checked })} className="size-4 accent-[var(--color-primary)]" />
              Show a “signed in” bar on later screens
            </label>
            {cfg.showSignedInBar ? (
              <input
                value={cfg.signedInTemplate}
                placeholder="Signed in as {username}"
                onChange={(e) => set({ signedInTemplate: e.target.value })}
                className={fieldCls}
              />
            ) : null}
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              Kept only in the participant’s browser for this run — never recorded or exported.
            </p>
          </>
        ) : null}
      </div>

      {/* Extras + behaviour */}
      <div className="flex flex-col gap-2">
        <span className={labelCls}>Extras</span>
        <label className="flex items-center gap-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]">
          <input type="checkbox" checked={cfg.showForgot} onChange={(e) => set({ showForgot: e.target.checked })} className="size-4 accent-[var(--color-primary)]" />
          Show a “Forgot password?” link
        </label>
        <label className="flex items-center gap-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]">
          <input type="checkbox" checked={cfg.showSignup} onChange={(e) => set({ showSignup: e.target.checked })} className="size-4 accent-[var(--color-primary)]" />
          Show a “Sign up” link
        </label>
        <label className="flex items-center gap-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          Show
          <select value={cfg.triggerKind} onChange={(e) => set({ triggerKind: e.target.value as Cfg["triggerKind"] })} className={`${fieldCls} py-1`}>
            <option value="on-load">When the screen opens</option>
            <option value="after">After a delay</option>
            <option value="conditional">When a condition is met</option>
          </select>
          {cfg.triggerKind === "after" ? (
            <>
              <input type="number" min={0} max={600} value={cfg.triggerAfterSec} onChange={(e) => set({ triggerAfterSec: Math.max(0, Math.min(600, Number(e.target.value) || 0)) })} className={`${fieldCls} w-20 py-1`} />
              seconds
            </>
          ) : null}
        </label>
      </div>

      {/* Deception gate */}
      <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3">
        <label className="flex items-center gap-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]">
          <input type="checkbox" checked={cfg.imitatesReal} onChange={(e) => set({ imitatesReal: e.target.checked })} className="size-4 accent-[var(--color-primary)]" />
          This imitates a real product’s sign-in (a deception)
        </label>
        {cfg.imitatesReal ? (
          <label className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-warning-subtle)] p-2 text-[length:var(--text-small)] text-[var(--color-warning-text-on-subtle)]">
            <input type="checkbox" checked={cfg.deceptionAck} onChange={(e) => set({ deceptionAck: e.target.checked })} className="mt-0.5 size-4 accent-[var(--color-primary)]" />
            I confirm my IRB/ethics approval covers showing participants a simulated login like this.
          </label>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onRemove}
        className="self-start text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:text-[var(--color-danger)]"
      >
        Remove block
      </button>
    </div>
  );
}
