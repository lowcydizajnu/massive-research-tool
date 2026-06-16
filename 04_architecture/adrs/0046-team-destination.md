# ADR 0046 — Team destination + invite semantics

- **Status:** accepted
- **Date:** 2026-06-15
- **Deciders:** project owner
- **Tags:** data-model, auth, team, ui

## Context

The **Team** item in the LeftRail has been inert since IA v0.3. Today the only way to add a member to a workspace is a direct DB insert — there is no invite flow, no role-management UI, no way to see who's on a team. V1.14 lights up `/team` so lab collaboration works end to end: a PI invites postdocs, postdocs invite RAs, roles + access are explicit.

Most of the data model already exists from V1.5 ([01-auth-tenancy-entities.md](../data-model/01-auth-tenancy-entities.md)): the `member` table (workspaceId, userId, `role` enum owner/admin/editor/viewer, `status` enum active/invited, invitedBy, invitedEmail) and the `user` table (Clerk `externalId` + profile). Per **ADR-0007**, membership lives in **our** database, not Clerk Organizations — Clerk is the identity provider only. So the build is mostly UI + a handful of tRPC procedures + one additive migration.

This ADR locks the semantics the owner confirmed 2026-06-15 (all five open questions resolved in favour of the recommendations). The role + status enums and the existing `writeProcedure` role gates cover everything else, so no other new ADR is needed for V1.14.

## Options considered

### Invite mechanism

- **Option A — Clerk Backend API `invitations.create()` + auto-link on sign-up (chosen).** On invite we create a `member` row (`status:'invited'`, `invitedEmail`, `invitedBy`) and call `clerkClient.invitations.create({ emailAddress, publicMetadata: { workspaceId, role } })`. The invitee lands on the existing `/signup` magic-link flow; a post-sign-up hook links the new `user` row to the pending `member` row by **lowercased email** and flips status to `active`. **Pros:** reuses Clerk's DNS-verified email infra (`clkmail.myresearchlab.app`) + the existing sign-up flow; no token table; metadata carries the workspace+role. **Cons:** couples invite delivery to Clerk (acceptable — Clerk is already the auth boundary per ADR-0007).
- **Option B — our own email + invite-token table.** Full control of the email + a `invite_token` table. **Pros:** vendor-neutral. **Cons:** reinvents deliverability + token lifecycle Clerk already gives us; more surface area.
- **Option C — Clerk Organizations.** Let Clerk own membership. **Rejected** — ADR-0007 deliberately keeps membership in our DB so authz, roles, and cross-workspace queries stay ours.

### Removing a member

- **Option A — soft-delete via `member.removed_at` + `member.removed_by_user_id` (chosen).** Setting these nullable columns removes the member from active views while preserving referential integrity for old activity events, comments, and mentions; historical attribution renders as a **tombstone** ("Maya Okonkwo (left 2026-04-12)"). `team.list()` filters removed by default; `includeRemoved:true` surfaces them for audit. **Pros:** attribution survives; reversible; audit-friendly. **Cons:** removed rows linger (filtered everywhere — a small ongoing discipline).
- **Option B — hard-delete the row.** **Cons:** breaks attribution on every past comment/event the member authored; not reversible. Reserved for genuine GDPR right-to-erasure, handled out-of-band.

### Number of owners

- **Option A — multiple owners allowed (chosen).** The schema doesn't restrict owner count; two-PI labs are common. The UI offers both **transfer ownership** (replace) and **promote to co-owner** (add). **Pros:** matches real labs. **Cons:** none material — the always-≥1-owner invariant still holds.
- **Option B — exactly one owner.** Simpler invariant but fights the two-PI reality.

## Decision

**We will build the Team destination on the existing `member`/`user` model: invite by email through the Clerk Backend API with `publicMetadata:{workspaceId,role}` auto-linked on sign-up; remove members by soft-delete with tombstone display; allow multiple owners; and emit filterable member-management activity events.**

Concretely, the locked semantics:

- **Invite + auto-link.** `team.invite` creates `member(status:'invited')` rows + Clerk invitations; the `/signup` post-hook links pending rows by lowercased email. **Idempotent:** re-inviting an existing email no-ops; pending invitations dedupe on `(workspaceId, lower(email))`.
- **Soft-delete.** Additive nullable columns `member.removed_at timestamptz` + `member.removed_by_user_id uuid`. `team.list()` hides removed by default (`includeRemoved` for audit); tombstones keep historical attribution readable. Hard-delete is reserved for GDPR erasure, out-of-band.
- **Always-≥1-owner invariant**, enforced server-side on `changeRole`, `removeMember`, `leaveWorkspace`, and ownership transfer — rejected with a friendly message, never a raw error.
- **Multiple owners.** `team.changeRole({ newRole:'owner' })` backs both transfer (old owner → admin in the same txn) and promote-to-co-owner (add an owner; existing owners unchanged); the UI frames the action per researcher intent.
- **Activity events** `member_added` / `member_role_changed` / `member_removed` / `ownership_transferred` / `co_owner_promoted` / `member_left` emit via the V1.7 `activity_event` table per **ADR-0015** patterns. Visible in the workspace Activity feed by default; owners/admins hide kinds via a new per-workspace `workspace.activity_filter_kinds jsonb` (Settings · Workspace), applied at query time in the feed + the V1.13.0 workspace-activity widget.

## Consequences

- **Easier:** real team management (invite/role/remove/transfer/leave) without DB access; cross-workspace `/me/memberships`; an audit trail that survives member removal.
- **Harder:** every member query must remember to filter `removed_at IS NULL` (centralised in `team.list()` + the helpers); the always-≥1-owner invariant must be re-checked on each mutating path.
- **Committed to:** Clerk as the invite-delivery channel (consistent with ADR-0007); soft-delete as the default removal; `publicMetadata` carrying invite intent.
- **Precluded (deferred):** workspace-level email-template editor (V1.14.1+), per-study role overrides (V1.16+), cross-workspace user search (V1.15+, needs privacy review), workspace deletion (later). Listed in the handoff's "What's NOT in V1.14".

## Revisit triggers

- GDPR right-to-erasure requests become routine → build a dedicated owner-only hard-delete ("purge member") flow.
- We move auth off Clerk → the invite-delivery + auto-link path is rewritten (the `member` model is unaffected).
- Researchers need per-study roles → a new ADR for per-study membership overrides.
- Teams grow large enough that the soft-deleted-row filter or the activity feed needs indexing/pagination beyond what's here.

## References

- Handoff — `04_architecture/handoffs/code-tab-v1140-team.md` (the spec this ADR formalizes; 5 owner decisions locked 2026-06-15).
- ADR-0007 — membership lives in our DB, not Clerk Orgs (why invites carry `publicMetadata` but roles stay ours).
- ADR-0015 — notifications/comments/activity; the `activity_event` patterns these member events follow.
- ADR-0033 — IA v0.5 personal mode; the `/me/memberships` route lives in that chrome.
- Data model — `04_architecture/data-model/01-auth-tenancy-entities.md` (the `member`/`user`/`workspace` shape).
- Code — `05_app/server/trpc/routers/workspace.ts` (`members()` for @-mention autocomplete; `team.*` parallels it); `05_app/components/chrome/left-rail.tsx` (the inert Team entry); `05_app/app/(auth)/signup/page.tsx` (the magic-link flow the post-hook extends).
