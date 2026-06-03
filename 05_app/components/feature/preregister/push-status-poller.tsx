"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { api } from "@/lib/trpc/react";

/**
 * While an OSF push is `pending`, poll the status and refresh the RSC the moment
 * it settles — so the banner flips blue → green/red on its own, without a manual
 * reload (preregister-stage.md). Renders nothing; mounted only while pending.
 */
export function PushStatusPoller({ studyId }: { studyId: string }) {
  const router = useRouter();
  const { data } = api.studies.getPreregistration.useQuery(
    { studyId },
    { refetchInterval: 2000 },
  );

  useEffect(() => {
    if (data && data.pushStatus !== "pending") router.refresh();
  }, [data, router]);

  return null;
}
