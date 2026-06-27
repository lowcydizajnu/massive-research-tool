"use client";

import { FollowButton } from "@/components/feature/follow/follow-button";
import { TRPCReactProvider } from "@/lib/trpc/react";

/**
 * Follow control for the public `/u/<handle>` page (EE2). That page lives
 * OUTSIDE the (app) shell, so it has no TRPCReactProvider — we mount a local one
 * here around the FollowButton (which uses tRPC React hooks). Rendered only for
 * an authed, non-self viewer (the page decides), so `follows.myFollows`
 * (protected) is never called anonymously.
 */
export function ProfileFollow({ targetId, name }: { targetId: string; name: string }) {
  return (
    <TRPCReactProvider>
      <FollowButton targetType="author" targetId={targetId} name={name} />
    </TRPCReactProvider>
  );
}
