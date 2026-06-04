"use client";

import { useFormStatus } from "react-dom";

import { PendingButton } from "./pending-button";

/**
 * Submit button for Server-Action `<form action={…}>` surfaces (e.g. the OSF
 * Connect/Disconnect on Account · Connections). Server Actions don't expose a
 * tRPC `isPending`, so the in-flight state comes from `useFormStatus()` — the
 * button must be rendered inside the form it submits. Same spinner treatment as
 * PendingButton (V1.7.1 item 1).
 */
export function FormSubmitButton({
  idleLabel,
  pendingLabel,
  variant = "primary",
  className,
}: {
  idleLabel: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <PendingButton
      type="submit"
      pending={pending}
      idleLabel={idleLabel}
      pendingLabel={pendingLabel}
      variant={variant}
      className={className}
    />
  );
}
