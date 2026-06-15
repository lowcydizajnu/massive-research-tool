# Code tab handoff — V1.14 Team destination

> **V1.14 = Team destination — workspace member management.** The Team item in the LeftRail has been inert since IA v0.3; this lights it up. Smaller than V1.15 Participants — most of the data model already exists (`member` + `user` tables, roles, invited-status). Mostly UI + a small handful of new tRPC procedures. Estimated **~1.5-2 weeks Code-tab time** across 4 PR streams.

V1.14 unblocks lab-collaboration workflows: lab PIs invite postdocs, postdocs invite RAs, RAs do data collection, everyone's roles + access are explicit. Today the only way to add a workspace member is via direct DB insert — no real flow.

---

## What's in place today

| Component | What's there | Where |
|---|---|---|
| `user` table | id, externalId (Clerk), email, displayName, fullName, affiliation, ORCID, researchAreas, bio, websiteUrl, scholarUrl (V1.12 §A2) | `server/db/schema.ts` |
| `member` table | id, workspaceId, userId, role (owner / admin / editor / viewer), status (active / invited), invitedBy, invitedEmail | `server/db/schema.ts` |
| `workspaceRouter.active()` + `.members()` | Returns the current workspace + member list (used by @-mention autocomplete since V1.7) | `server/trpc/routers/workspace.ts` |
| Role gating | `writeProcedure` checks role ≥ editor; admin/owner gates exist for specific actions (Settings → Workspace was admin-only as of V1.13.0) | `server/trpc/utils/procedures.ts` |
| Clerk magic-link sign-up | Anyone can sign up; restriction-mode toggles control whether public sign-ups are accepted (per recent Clerk dashboard convo) | `app/(auth)/signup/` + Clerk dashboard |
| LeftRail "Team" entry | Visible but inert (no `href`) — `{ label: "Team", icon: UsersRound }` line 41 of `left-rail.tsx` | `components/chrome/left-rail.tsx` |
| `member.role` enum | owner / admin / editor / viewer | `server/db/schema.ts` enums |
| `member.status` enum | active / invited | `server/db/schema.ts` enums |

## What's missing (the V1.14 build)

- `/team` route + sub-nav
- Member-list view (active + invited members; role chips; last active)
- Invite flow (single + bulk paste; either through Clerk's user-create OR via email magic-link)
- Per-member detail view (their profile + contributions to this workspace)
- Role-management UI (change role + remove + ownership transfer + member-self-leave)
- Pending-invitations management (resend, revoke, copy invite link)
- Per-member activity sub-view (their recent edits/comments/etc. in this workspace)

---

## Section T1 — Team destination shell + members list (~3 days)

**Route:** `/team` under `(workspace)`. Sub-nav: **Members** (default) / **Invitations** / **Roles & permissions** (settings reference).

### Members tab (default)

The main view. Lists every active member of the workspace.

**Card-or-table layout:**

- Avatar (Clerk-hosted from `user.avatarUrl`) + display name + email + affiliation badge
- Role chip (Owner / Admin / Editor / Viewer) — color-coded; click to see role description
- Status: Active / Inactive (last activity > 30 days)
- Joined date + Last active relative-time
- Per-row actions (gated by viewer's role):
  - Owner viewing: Change role / Remove / Transfer ownership
  - Admin viewing: Change role (except owner) / Remove (except owner)
  - Editor/Viewer viewing: just opens the member's detail view
- Click row → opens per-member detail (Section T4)

**Top-right action bar:**

- **"+ Invite member"** button (owner/admin only)
- Search: name / email
- Filter: by role / by status / by contribution count
- Sort: name / joined date / last active / contributions

**Empty state** (single-member workspace, no invitations yet):

"You're the only person here. Invite teammates to start collaborating." with prominent invite CTA.

### Data layer

- `team.list()` — `workspaceProcedure` returning all members with computed lastActiveAt (max of recent comments / edits / sign-ins per user_id in this workspace)
- Existing `workspaceRouter.members()` returns shape `{ userId, displayName }[]` — replace/extend with the richer team-list shape, OR add a new procedure `team.list()` so the lightweight @-mention autocomplete keeps its shape.

### Wireframe gate

`03_design/wireframes/team-members.md`.

---

## Section T2 — Invite flow (~3-4 days)

The most operationally important piece. Today there's no real way to add a member without DB inserts.

### Two-path invite

Per `member.status = 'invited'` semantics: invitations create a `member` row with `status: 'invited'` and `invitedEmail` set. When the invitee signs up via the magic link, the `user` row gets created + linked to the existing `member` row (matched on `invitedEmail = user.email`).

**Path A — Email magic-link invite (recommended default):**

- Owner/admin pastes email + picks role
- We create a `member(invitedEmail, role, status='invited', invitedBy=current_user_id)` row
- Send invite email via Clerk's `client.invitations.create()` (Clerk Backend API supports this; lands the user at `/signup` with a Clerk-pre-populated email)
- Invitee clicks link → magic-link sign-up flow (the existing one from V1.5) → on first sign-in, the post-signup hook links their new `user` row to the pending `member` row (matched by lowercased email) + flips status to 'active'

**Path B — Bulk paste invite:**

- Owner/admin pastes a list of emails (one per line OR CSV) + picks a single role for all
- We validate emails + dedupe against existing members and existing pending invitations
- Loop: create member rows + send invitations
- Returns a result summary: "5 invites sent / 1 already a member / 1 invalid email"

### UI

- "Invite member" button → opens modal:
  - Email input (single OR multi-line for bulk)
  - Role select (default: Editor; Owner can pick any role; Admin can pick up to Editor)
  - Personal message (optional; appended to the invite email body)
  - "Send invitations" button — disabled until form valid
  - On success: closes; toast "Invited 3 members" + shifts the user to the Invitations tab
- Invitation email body customizable later; default = "Hanna invited you to join the {workspace_name} workspace on Massive Research Tool. Click here to accept."

### Pending invitations tab

The Invitations sub-tab lists pending (status='invited') member rows:

- Email + invited-by + invited-at + role + age (days outstanding)
- Per-row actions: **Resend invite** (regenerates the magic link via Clerk) / **Revoke invite** (deletes the member row + revokes the Clerk invitation if not yet accepted)
- "Copy invite link" — for sharing manually (Slack, etc.) if email isn't reliable
- Stale invitations (>14 days) auto-flagged amber

### Data layer

- `team.invite({ emails: string[], role, personalMessage? })` — owner/admin-only; creates member rows + calls Clerk Backend API `client.invitations.create()` for each
- `team.listInvitations()` — workspaceProcedure returning status='invited' rows + age
- `team.resendInvite({ memberId })`
- `team.revokeInvite({ memberId })` — deletes the member row + revokes Clerk invitation

### Implementation notes

- Clerk Backend API: `clerkClient.invitations.create({ emailAddress, publicMetadata: { workspaceId, role } })`. On sign-up, the user's publicMetadata reflects which workspace they were invited to; the existing `/signup` hook then auto-links to the pending `member` row.
- Email deliverability: relies on Clerk's email infrastructure (already DNS-verified for `clkmail.myresearchlab.app` per V1.7.0 deploy).
- Idempotency: re-inviting an existing email no-ops (returns success without spawning a duplicate row).

### Wireframe gate

`03_design/wireframes/team-invite-modal.md` + `03_design/wireframes/team-invitations-tab.md`.

---

## Section T3 — Per-member detail view (~2 days)

**Route:** `/team/[memberId]` (or modal on the members list).

Opens when you click a member row. Read-mostly profile view + per-workspace activity.

### Layout

- **Header:** avatar + display name + email + role chip + joined-date + last-active
- **Profile card** (read view of `user` columns set in V1.12 §A2):
  - Full name + affiliation
  - ORCID (with link to orcid.org)
  - Bio
  - Research areas (tag chips)
  - Website + Scholar URLs
  - "View public profile" (links to a future cross-workspace profile page if/when that exists; V1.15+)
- **Contributions in this workspace:**
  - Studies authored (count + recent list — links to each study)
  - Studies replicated (count)
  - Comments + mentions made (count)
  - Versions saved (count)
  - Last activity by type (small histogram of last 30 days)
- **Role + access** (admin/owner-viewing only):
  - Current role + permissions summary
  - Change role action
  - Remove from workspace action (with confirmation)
  - Transfer ownership (owner-only viewing; only if the member has admin role)
- **Activity timeline** (last 50 events involving this member in this workspace) — small sub-tab

### Data layer

- `team.get({ memberId })` — workspaceProcedure returning full member + user + computed contribution counts
- `team.memberActivity({ memberId, limit })` — workspaceProcedure returning `activity_event` rows where actor_user_id = member's user_id, scoped to current workspace

### Wireframe gate

`03_design/wireframes/team-member-detail.md`.

---

## Section T4 — Role management + ownership transfer + self-leave (~2 days)

The sensitive operations. Each needs careful gating + confirmations.

### Change role

- Owner can promote/demote anyone (including other owners — but workspace must always have ≥1 owner)
- Admin can change roles up to Editor (can't promote anyone to Admin or Owner; can't change Owner)
- Editor/Viewer can't change roles
- UI: per-member dropdown of valid target roles (filtered by viewer's permissions + invariants)
- Server-side: `team.changeRole({ memberId, newRole })` validates the rule + the always-≥1-owner invariant
- Activity event: `member_role_changed` (per ADR-0015 patterns) for audit trail

### Remove member

- Owner can remove anyone except themselves (must transfer ownership first)
- Admin can remove Editor/Viewer (not Owner or Admin)
- Confirmation modal: "Remove {Name} from {Workspace}? They'll lose access to all studies in this workspace. Their authored studies stay (ownership transfers to the workspace owner)."
- Server-side: `team.removeMember({ memberId })` — soft-delete? Or hard delete the member row? Per project precedent (archived not deleted): soft-delete via `member.removed_at` + `member.removed_by_user_id` + maintain referential integrity for old activity events.
- Activity event: `member_removed`

### Transfer ownership

- Owner-only action
- "Transfer ownership" picker → select an Admin (only Admins can become Owner)
- Two-step confirmation: "You'll become an Admin; {Name} will become the Owner. Continue?"
- Atomic transaction: old owner → admin; new owner → owner
- Activity event: `ownership_transferred`
- Workspace can have multiple owners? Per current schema and ADR-0007 / authz design: yes, multiple owners allowed. So this is more "promote to owner" than "transfer." Spec: ownership transfer can either add a new owner or replace; researcher picks via the modal.

### Self-leave (member leaving workspace)

- Any member can leave a workspace they belong to
- Owner can't leave if they're the only owner (must transfer ownership first OR delete the workspace)
- "Leave workspace" button on per-member view when viewing self; OR in Settings → My memberships
- Confirmation: "Leave {Workspace}? You'll lose access to all studies. To rejoin you'll need a new invitation."
- Server-side: same as remove but actor = self
- Activity event: `member_left`

### Settings → My memberships (cross-workspace surface)

In Personal mode at `/me/memberships` (or under Settings): list of all workspaces the user belongs to + role + leave button per row. Useful as a single point to manage all workspace memberships.

### Wireframe gate

`03_design/wireframes/team-role-management.md` + dialogs.

---

## Section T5 — Roles & permissions reference sub-tab (~1 day)

A static-ish reference page documenting what each role can do.

**Route:** `/team/roles` sub-tab.

Renders a permissions matrix:

| Action | Owner | Admin | Editor | Viewer |
|---|---|---|---|---|
| View studies | ✓ | ✓ | ✓ | ✓ |
| Edit studies | ✓ | ✓ | ✓ | — |
| Save as named version | ✓ | ✓ | ✓ | — |
| Preregister to OSF | ✓ | ✓ | ✓ | — |
| Open recruitment | ✓ | ✓ | ✓ | — |
| Comment + mention | ✓ | ✓ | ✓ | ✓ |
| Invite members | ✓ | ✓ | — | — |
| Change member roles | ✓ | ✓ (limited) | — | — |
| Remove members | ✓ | ✓ (limited) | — | — |
| Workspace settings | ✓ | ✓ | — | — |
| Set workspace dashboard default | ✓ | ✓ | — | — |
| Transfer ownership | ✓ | — | — | — |
| Delete workspace | ✓ | — | — | — |
| Connect recruitment providers (Prolific, V1.15) | ✓ | ✓ | — | — |
| Approve/reject submissions (V1.15) | ✓ | ✓ | ✓ | — |

Useful for "what role should I give the new lab manager?" decisions.

No data layer; static page derived from the role registry.

---

## ADRs needed

Mostly small; the data model already exists.

- **ADR-0046 (or whatever's next) — Team destination + invite semantics.** Covers: invite-by-email flow via Clerk Backend API; idempotency rules; soft-delete vs hard-delete for `member`; always-≥1-owner invariant; activity events for audit trail; the "publicMetadata.workspaceId-on-invite-then-auto-link-on-signup" pattern.

That's the only new ADR. The existing role + status enums + procedures cover everything else.

---

## Wireframes needed (phase-gate per CLAUDE.md)

- `team-destination.md` (sub-nav scaffold)
- `team-members.md` (list view)
- `team-invite-modal.md`
- `team-invitations-tab.md`
- `team-member-detail.md`
- `team-role-management.md` (dialogs + role-change UI + remove confirmation)

6 wireframes; they share a card-list scaffold so they're cheap once the first lands.

---

## Sequencing PRs (~1.5-2 weeks total)

**Stream T1 — Foundation (~4 days):**
- PR T1.1: `team.list()` + `team.listInvitations()` + `/team` route + members tab UI + ADR-0046 (~3 days)
- PR T1.2: Per-member detail view + `team.get()` + `team.memberActivity()` + activity timeline (~1 day)

**Stream T2 — Invite flow (~3 days):**
- PR T2.1: `team.invite()` single + bulk + Clerk Backend API integration + Invitations tab UI (~2 days)
- PR T2.2: Resend / revoke / copy-link affordances + email customization (~1 day)

**Stream T3 — Role management (~2 days):**
- PR T3.1: `team.changeRole()` + `team.removeMember()` + role-change UI dialog + always-≥1-owner invariant tests (~1 day)
- PR T3.2: `team.transferOwnership()` + `team.leaveWorkspace()` + dialogs + cross-workspace memberships in Personal mode (~1 day)

**Stream T4 — Polish + close-out (~1 day):**
- PR T4.1: Roles & permissions reference tab + Member's profile cross-link to Settings · Account (~1 day)
- PR T4.2: e2e (Hanna invites Maya → Maya signs up via magic link → lands in workspace as Editor → Hanna promotes to Admin → Maya signs in + sees Settings access) (~half day)

All four streams largely independent except T2 requires T1 (members list to surface invitations).

---

## Open questions for owner

1. **Soft-delete vs hard-delete for removed members?** Soft-delete preserves activity-event references (so "Maya commented in 2026-03" still shows her name in old comments). Hard-delete is simpler but breaks historical attribution. (Recommendation: soft-delete with `removed_at` + tombstone display.)
2. **Email customization for invitations — required or nice-to-have?** Clerk has default email templates; we can override per-invite with the personal-message field, OR build a workspace-level template editor later. (Recommendation: per-invite personal message in V1.14; workspace-level template editor in V1.14.1+ if requested.)
3. **Multiple owners allowed?** Schema doesn't currently restrict it. Some teams have 2 PIs; some prefer single-owner. (Recommendation: allow multiple owners; UI emphasizes "transfer" but supports "promote to co-owner" too.)
4. **"My memberships" cross-workspace surface — Settings · Memberships OR new Personal-mode route?** Both work; Personal-mode is consistent with V1.13.0's /home/me/notifications routing. (Recommendation: Personal-mode `/me/memberships` route + a small link from Settings.)
5. **Audit trail visibility** — should role changes + removes show up in workspace Activity feed? Useful for transparency but adds noise. (Recommendation: yes, surface in Activity; admins/owners can filter them out via per-workspace activity-filter preference.)

---

## Files to read first

1. This handoff start to finish.
2. `04_architecture/data-model/01-auth-tenancy-entities.md` — the locked User / Workspace / Member shape from V1.5.
3. `04_architecture/adrs/0007-path-a-vs-b.md` — Clerk is the auth identity provider; membership stays in our DB.
4. `05_app/server/db/schema.ts` — existing `user` + `member` + `workspace` tables.
5. `05_app/server/trpc/routers/workspace.ts` — existing `workspaceRouter.members()` for @-mention autocomplete; you're extending / paralleling this.
6. `05_app/components/chrome/left-rail.tsx` line 41 — the inert Team entry you're lighting up.
7. `05_app/app/(auth)/signup/page.tsx` — the existing magic-link sign-up flow; you're adding a post-signup hook to link pending member rows.

---

## What's NOT in V1.14 (still deferred)

- **Cross-workspace user search** (find researchers across workspaces) — V1.15+; needs a privacy review.
- **Workspace deletion flow** — V1.14.1 or later; needs care around data preservation + member notifications.
- **Workspace creation flow improvements** — `+ New workspace` exists today; this V1.14 doesn't add to it.
- **External (non-Clerk) invitations** — invite by sharing a link only (no email). Defer; the magic-link approach is the primary path.
- **Per-study role overrides** — a member's role per study (researcher might be Editor on Study A but Viewer on Study B). Currently roles are workspace-wide. Deferred to V1.16+ if requested.
- **Team-level activity dashboard** — a "what's our team done this week" surface. Could overlap with V1.13.0's workspace dashboard "team-activity" widget; if researchers want more, build in V1.14.1.
- **Invitee preview** — letting someone preview a workspace before accepting (peek at studies). Deferred; security-sensitive.

When green: ping owner. Owner runs a quick smoke test (invite a colleague's email, walk through the magic-link flow, accept, verify role applied); signs the audit log; tags `v1.14.0`.
