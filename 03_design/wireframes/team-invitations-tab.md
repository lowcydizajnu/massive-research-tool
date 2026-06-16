# Wireframe spec — Team invitations tab

- **Serves user flow:** [Manage team members](../../02_product/user-flows/manage-team-members.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Principal investigator](../../02_product/personas/principal-investigator.md)
- **Status:** draft

## Purpose

Manage pending invitations — see who's been invited but hasn't joined, and resend, revoke, or copy the invite link.

## Layout

A list (same card-or-table scaffold as Members) under the Team sub-nav's **Invitations** tab. Action bar reuses **+ Invite member**.

## Content inventory

- **Invited email** — from `member.invitedEmail`.
- **Role** — the role the invite grants (chip).
- **Invited by** — display name of `invitedBy`.
- **Invited at + age** — relative time + days outstanding.
- **Stale flag** — amber chip when age > 14 days.
- **Per-row actions** — Resend invite · Revoke · Copy invite link.

## States

- **Default** — list of `status:'invited'` rows.
- **Loading** — row skeletons.
- **Empty** — "No pending invitations." + Invite CTA.
- **Error** — inline alert + Retry.
- **Optimistic** — Revoke removes the row immediately; Resend shows a "Sent ✓" confirmation on the row.

## Interactions

- **Resend invite** — `team.resendInvite({ memberId })` regenerates the Clerk magic link; row shows "Sent ✓ {time}".
- **Revoke** — confirm → `team.revokeInvite({ memberId })` deletes the `member` row + revokes the Clerk invitation (if unaccepted); row disappears; toast.
- **Copy invite link** — copies a shareable accept URL to the clipboard (for Slack/DM when email is unreliable); toast "Link copied".

## Edge cases

- An invite accepted between render and action → Resend/Revoke no-op gracefully (the row is now an active member; refetch moves it to Members).
- Revoking after acceptance → not offered (it's an active member; use Remove on Members).
- Copy-link in an insecure context / clipboard denied → fall back to a selectable text field.
- Stale (>14d) invites sort to the top with the amber flag.

## Accessibility notes

- Row actions are keyboard-reachable buttons with explicit labels ("Resend invite to name@lab.edu").
- "Copy link" success is announced via `aria-live`, not just a toast.

## Open questions

- None blocking.
