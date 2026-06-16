# Wireframe spec — Team invite modal

- **Serves user flow:** [Manage team members](../../02_product/user-flows/manage-team-members.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Principal investigator](../../02_product/personas/principal-investigator.md)
- **Status:** draft

## Purpose

Let an owner/admin invite one or many people to the workspace by email, with a role and an optional personal note — the primary way to add a member (replacing DB inserts).

## Layout

Modal dialog over the Team destination:

- **Title:** "Invite to {workspace}".
- **Email field:** single-line for one invite; accepts a multi-line / comma / CSV paste for bulk (placeholder "name@lab.edu — paste several, one per line").
- **Role select:** Owner / Admin / Editor / Viewer; default **Editor**. Owner sees all; Admin capped at Editor.
- **Personal message** (optional, multi-line) — appended to the invite email body.
- **Footer:** **Send invitations** (primary, disabled until ≥1 valid email) · Cancel.

## Content inventory

- **Email input** — user text; validated as email(s); deduped against existing members + pending invites.
- **Role select** — from the role enum, filtered by the actor's permissions.
- **Personal message** — user text, optional, capped (~500 chars).
- **Inline validation** — per-email errors (invalid / already a member / already invited).
- **Result summary** (post-send) — "Invited 5 · 1 already a member · 1 invalid".

## States

- **Default** — empty form, Send disabled.
- **Valid** — ≥1 parseable email, Send enabled.
- **Submitting** — Send shows a spinner (PendingButton); inputs disabled.
- **Success** — toast "Invited N members"; modal closes; the destination switches to the **Invitations** tab. Bulk with mixed results shows the summary before closing.
- **Partial/Error** — per-email errors listed inline; transient send failure → inline alert + retry; already-sent invites aren't duplicated (idempotent).

## Interactions

- **Paste list** — splits on newline/comma; trims; dedupes; shows a chip/count of parsed addresses.
- **Send invitations** — calls `team.invite({ emails, role, personalMessage? })`: creates `member(status:'invited')` rows + Clerk `invitations.create({ publicMetadata:{ workspaceId, role } })` per email; re-inviting an existing email no-ops.
- **Cancel / Esc / backdrop** — closes without sending.

## Edge cases

- Email already an active member → reported, not re-invited.
- Email already pending → reported as "already invited" (offer Resend in the Invitations tab).
- Mixed-case / whitespace emails → normalized to lowercased+trimmed before dedupe/match.
- Admin picks a role > Editor → option not offered; server rejects defensively.
- Very large paste (100s) → accepted; summary reports counts; (no hard cap in V1.14, but warn over ~200).

## Accessibility notes

- Focus traps in the modal; initial focus on the email field; Esc closes; focus returns to the **Invite member** trigger.
- The role select + per-email errors are associated via `aria-describedby`; the result summary is announced (`aria-live`).

## Open questions

- None blocking. Workspace-level email-template editing is explicitly V1.14.1+ (per-invite message only here).
