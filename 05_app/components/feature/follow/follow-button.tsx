"use client";

import { useRouter } from "next/navigation";

import { Spinner } from "@/components/ui/pending-button";
import { signInHref } from "@/lib/auth/sign-in-redirect";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import type { FollowTargetType } from "@/server/trpc/routers/follows";

/**
 * The one reusable +Follow toggle (follow-affordances.md, ADR-0015). Reads the
 * user's follows once (cached) to decide state; follow/unfollow optimistically
 * invalidate myFollows + the Follows feed. State is conveyed by text, never
 * color alone; the accessible name includes the target. Parents gate rendering
 * for self (you don't follow your own author/study).
 */
export function FollowButton({
  targetType,
  targetId,
  name,
  className,
  authed = true,
}: {
  targetType: FollowTargetType;
  targetId: string;
  /** Human label for the accessible name (tag slug / author / Framework / study title). */
  name?: string;
  className?: string;
  /** GitHub-model (ADR-0055 am.1): on a public page, anon sees the button but a
   *  click routes to /signin. false ⇒ skip the protected on-mount query too. */
  authed?: boolean;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const { data: mine } = api.follows.myFollows.useQuery(undefined, { enabled: authed });
  const following = (mine ?? []).some(
    (f) => f.targetType === targetType && f.targetId === targetId,
  );
  const invalidate = () => {
    void utils.follows.myFollows.invalidate();
    void utils.follows.feed.invalidate();
    void utils.follows.list.invalidate();
  };
  const follow = api.follows.follow.useMutation({ onSuccess: invalidate });
  const unfollow = api.follows.unfollow.useMutation({ onSuccess: invalidate });
  const pending = follow.isPending || unfollow.isPending;
  const label = name ?? targetId;

  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={following}
      aria-label={following ? `Following ${label} — activate to unfollow` : `Follow ${label}`}
      onClick={() =>
        !authed
          ? router.push(signInHref())
          : following
            ? unfollow.mutate({ targetType, targetId })
            : follow.mutate({ targetType, targetId })
      }
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-md)] px-2 py-0.5 text-[length:var(--text-small)] font-medium",
        following
          ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
          : "border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
        pending && "opacity-60",
        className,
      )}
    >
      {pending ? <Spinner className="size-3" /> : null}
      {following ? "Following" : "+ Follow"}
    </button>
  );
}
