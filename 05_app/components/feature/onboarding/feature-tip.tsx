"use client";

import { useUser } from "@clerk/nextjs";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

import { dismissFeatureTip } from "@/app/actions/dismiss-feature-tip";
import { FEATURE_TIPS, type FeatureTipId } from "@/lib/feature-tips";
import { cn } from "@/lib/utils";

/**
 * A one-time feature-discovery hint (platform-foundation PF3.3). Renders an
 * inline callout the first time the researcher sees the surface it's placed on;
 * dismisses on click OR after 8s, persisting the dismissal to Clerk
 * publicMetadata so it never reappears (across devices). Presence-based: it
 * shows whenever mounted + not yet dismissed — keep it mounted only where the
 * feature actually lives.
 */
const AUTO_DISMISS_MS = 8000;

export function FeatureTip({ id, className }: { id: FeatureTipId; className?: string }) {
  const { isLoaded, user } = useUser();
  const [dismissed, setDismissed] = useState(false);

  const tips = user?.publicMetadata?.dismissedFeatureTips;
  const already = Array.isArray(tips) && (tips as unknown[]).includes(id);
  const visible = isLoaded && !!user && !already && !dismissed;

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      setDismissed(true);
      void dismissFeatureTip(id);
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [visible, id]);

  if (!visible) return null;

  const dismiss = () => {
    setDismissed(true);
    void dismissFeatureTip(id);
  };

  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-primary)] bg-[var(--color-primary-subtle)] px-3 py-2 text-[length:var(--text-small)] text-[var(--color-primary-text-on-subtle)]",
        className,
      )}
    >
      <span className="flex-1">{FEATURE_TIPS[id]}</span>
      <button
        type="button"
        aria-label="Dismiss tip"
        onClick={dismiss}
        className="shrink-0 opacity-70 hover:opacity-100"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
