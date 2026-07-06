"use client";

import { useEffect, useState } from "react";

import { isLive, readCarries, subscribeCarry, type CarriedNotification } from "@/lib/take/notification-carry";
import { NotificationView } from "./notification-view";

/**
 * Renders `scope: "persist"` notifications on screens AFTER their anchor
 * (ADR-0095 am. 2026-07-06). Mounted once per take screen; reads the
 * sessionStorage carry the anchor block wrote and re-renders each carried notice
 * as a banner into `#take-topbar` (via NotificationView's `carried` mode) until
 * the participant dismisses it. Instances whose own block is live on THIS screen
 * are skipped, so the anchor screen never shows the banner twice.
 */
export function PersistentNotificationHost({ responseId }: { responseId: string }) {
  const [items, setItems] = useState<CarriedNotification[]>([]);

  useEffect(() => {
    const refresh = () => setItems(readCarries(responseId).filter((c) => !isLive(c.instanceId)));
    refresh();
    return subscribeCarry(refresh);
  }, [responseId]);

  return (
    <>
      {items.map((c) => (
        <NotificationView
          key={c.instanceId}
          config={c.config}
          np=""
          carried
          responseId={responseId}
          instanceId={c.instanceId}
        />
      ))}
    </>
  );
}
