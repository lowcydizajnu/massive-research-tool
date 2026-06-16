# Code tab handoff — V1.14 Team destination (updated 2026-06-15 round 2 — owner answers locked)

> **V1.14 = Team destination — workspace member management.** The Team item in the LeftRail has been inert since IA v0.3; this lights it up. Smaller than V1.15 Participants — most of the data model already exists (`member` + `user` tables, roles, invited-status). Mostly UI + a small handful of new tRPC procedures + 1 additive migration for soft-delete columns + activity-filter prefs. Estimated **~2 weeks Code-tab time** across 4 PR streams (~1.5-2 weeks original + ~1 day for T5b activity-filter prefs + ~half day for `/me/memberships`).
>
> **All 5 open questions resolved 2026-06-15** (owner agreed to all recommendations): soft-delete with tombstone display; per-invite personal message + defer workspace template editor to V1.14.1+; multiple owners allowed (UI supports transfer + co-owner-promote); Personal-mode `/me/memberships` route; audit events in Activity feed + filterable via Settings · Workspace activity-filter prefs.

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

- Owner can remove anyone except themselves (must transfer ownership first if sole owner)
- Admin can remove Editor/Viewer (not Owner or Admin)
- Confirmation modal: "Remove {Name} from {Workspace}? They'll lose access to all studies in this workspace. Their authored studies stay (ownership transfers to the workspace owner)."
- **Server-side: `team.removeMember({ memberId })` does SOFT-delete** (owner-confirmed 2026-06-15). Schema adds `member.removed_at timestamptz NULL` + `member.removed_by_user_id uuid NULL`. Setting these flags removes the member from active views; preserves referential integrity for old activity events + comments + mentions. `team.list()` filters out removed by default; `team.list({ includeRemoved: true })` surfaces them for audit trails.
- **Tombstone display:** old comments + activity entries continue to show the removed member's name with a small "(left {date})" suffix so historical attribution stays readable.
- **Hard-delete reserved for GDPR right-to-erasure requests** handled out-of-band (rare; owner-level decision).
- Activity event: `member_removed` — emits per ADR-0015 patterns.

### Transfer ownership + promote to co-owner

**Multiple owners allowed** (owner-confirmed 2026-06-15) — schema doesn't restrict; common in two-PI labs. UI supports both flows:

- **Transfer ownership (replaces):** Owner-only action. "Transfer ownership" picker → select an Admin (or another existing Owner who's leaving). Two-step confirmation: "You'll become an Admin; {Name} will become the Owner. Continue?" Atomic transaction: old owner → admin; new owner → owner.
- **Promote to co-owner (adds):** Owner-only action. "Make co-owner" picker → select an Admin. Two-step confirmation: "{Name} will become a co-owner with full workspace permissions. Continue?" Atomic transaction: new owner row added; existing owners unchanged. The always-≥1-owner invariant naturally holds.
- Same `team.changeRole({ memberId, newRole: 'owner' })` endpoint handles both; the UI just frames the action differently per researcher intent.
- Activity event: `ownership_transferred` (replace flow) OR `co_owner_promoted` (add flow). Both emit per ADR-0015.

### Self-leave (member leaving workspace)

- Any member can leave a workspace they belong to
- Owner can't leave if they're the only owner (must transfer ownership first OR delete the workspace)
- "Leave workspace" button on per-member view when viewing self; OR in Settings → My memberships
- Confirmation: "Leave {Workspace}? You'll lose access to all studies. To rejoin you'll need a new invitation."
- Server-side: same as remove but actor = self
- Activity event: `member_left`

### Personal-mode `/me/memberships` (cross-workspace surface — owner-confirmed 2026-06-15)

New route at `app/(app)/(personal)/me/memberships/page.tsx` (Personal mode chrome per ADR-0033 IA v0.5). Lists every workspace the user belongs to + role + joined date + last activity + per-row actions:

- **Switch to** (changes the active workspace cookie + navigates to that workspace's /dashboard)
- **Leave** (calls `team.leaveWorkspace`; owner-as-sole-owner blocked with helpful message)
- **View workspace settings** (deeplink if user is admin/owner there)

Plus a small **"Workspaces"** link from Settings · Account that deeplinks to `/me/memberships` (findability — researchers won't always discover Personal-mode routes via the workspace switcher).

Data: existing `meRouter.workspaces()` from V1.13.0 Stream A already returns the right shape — just point a new page at it. ~half day on top of the other Section T4 work.

### Wireframe gate

`03_design/wireframes/team-role-management.md` + dialogs.

---

## Section T5b — Activity-filter preferences (owner-confirmed 2026-06-15; ~1 day)

Member-management events (member_added / role_changed / removed / ownership_transferred / co_owner_promoted / member_left) surface in the workspace Activity feed by default per ADR-0015. Some workspaces will find this noisy; the V1.14 build adds a per-workspace **activity filter** to hide them.

**Settings · Workspace → Activity filter preferences** (owners + admins):

- Checkbox list of event kinds to surface in the workspace Activity feed
- Default: all on except `member_added` (slightly noisy on big teams)
- Saved per-workspace, applied at query time in the workspace Activity feed + V1.13.0 dashboards' workspace-activity widget

**Data:** new field on `workspace` table — `activity_filter_kinds jsonb NOT NULL DEFAULT '[]'::jsonb` (empty = all on; non-empty = explicit list of hidden kinds). Additive migration.

**tRPC:** extend the existing `workspace.recentActivity` to honor the filter; new `workspace.updateActivityFilter({ hiddenKinds })` admin-only mutation.

Modest scope; rounds out the audit-trail-but-not-noisy story.

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

- **ADR-0046 (or whatever's next) — Team destination + invite semantics.** Locks the owner-confirmed decisions from 2026-06-15:
  - Invite-by-email flow via Clerk Backend API `clerkClient.invitations.create()` with `publicMetadata: { workspaceId, role }`
  - Idempotency: re-inviting an existing email no-ops; pending invitations dedupe on (workspaceId, lowercased email)
  - **Soft-delete via `member.removed_at` + `member.removed_by_user_id`** (additive nullable columns); `team.list()` filters out by default; tombstone display preserves historical attribution; hard-delete reserved for GDPR right-to-erasure
  - **Always-≥1-owner invariant** enforced server-side on changeRole + removeMember + leaveWorkspace + transferOwnership; rejects with friendly message
  - **Multiple owners allowed**; `team.changeRole({ newRole: 'owner' })` supports both transfer (replace) and promote-to-co-owner (add) flows; UI frames per-intent
  - Activity events: `member_added` / `member_role_changed` / `member_removed` / `ownership_transferred` / `co_owner_promoted` / `member_left` per ADR-0015 patterns; filterable in workspace Activity feed via the new per-workspace `activity_filter_preferences` (Section T5b)
  - The "publicMetadata.workspaceId-on-invite-then-auto-link-on-signup" pattern with lowercased-email matching

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

## Sequencing PRs (~2 weeks total)

**Stream T1 — Foundation (~4 days):**
- PR T1.1: Drizzle migration (additive: `member.removed_at` + `member.removed_by_user_id` + `workspace.activity_filter_kinds`) + `team.list()` (filters soft-deleted by default; supports `includeRemoved`) + `team.listInvitations()` + `/team` route + members tab UI + ADR-0046 (~3 days)
- PR T1.2: Per-member detail view + `team.get()` + `team.memberActivity()` + activity timeline (~1 day)

**Stream T2 — Invite flow (~3 days):**
- PR T2.1: `team.invite()` single + bulk + Clerk Backend API integration + Invitations tab UI (~2 days)
- PR T2.2: Resend / revoke / copy-link affordances + per-invite personal-message field (~1 day)

**Stream T3 — Role management (~2.5 days):**
- PR T3.1: `team.changeRole()` (supports transfer-replace OR promote-to-co-owner) + `team.removeMember()` (soft-delete with tombstone) + role-change UI dialog + always-≥1-owner invariant tests (~1.5 days)
- PR T3.2: `team.transferOwnership()` + `team.promoteToCoOwner()` (or unified `changeRole({newRole: 'owner'})`) + `team.leaveWorkspace()` + dialogs + Personal-mode `/me/memberships` page reusing `meRouter.workspaces()` from V1.13.0 (~1 day)

**Stream T4 — Polish + activity filter + close-out (~2.5 days):**
- PR T4.1: T5b activity-filter prefs in Settings · Workspace + `workspace.updateActivityFilter()` + extend `workspace.recentActivity` to honor filter + tombstone-display in old activity rows / comments (~1 day)
- PR T4.2: Roles & permissions reference tab + Member's profile cross-link to Settings · Account + small "Workspaces" link from Settings → `/me/memberships` (~1 day)
- PR T4.3: e2e (Hanna invites Maya → Maya signs up via magic link → lands in workspace as Editor → Hanna promotes to Admin → Hanna removes Maya → tombstone appears in old comments → Hanna re-invites Maya → Maya rejoins) (~half day)

All four streams largely independent except T2 requires T1 (members list to surface invitations). T4's tombstone-display piece touches comment + activity components — minor cross-cutting work, allow buffer.

---

## Open questions — fully resolved 2026-06-15 (owner agreed to all 5 recommendations)

1. ✅ **Soft-delete for removed members.** Schema adds `member.removed_at timestamptz` + `member.removed_by_user_id uuid` (additive nullable columns; migration); `team.list()` filters out removed by default with optional `includeRemoved: true` flag for the audit-trail view; UI renders removed members as tombstoned chips ("Maya Okonkwo (left 2026-04-12)") in old activity rows + comments so historical attribution survives. Hard-delete reserved for genuine GDPR right-to-erasure requests handled out-of-band.
2. ✅ **Per-invite personal message in V1.14.** Invite modal already specs the optional personal-message field; default invitation email template is Clerk's. **Workspace-level email template editor explicitly deferred to V1.14.1+** (added to the "What's NOT in V1.14" list below).
3. ✅ **Multiple owners allowed.** Schema doesn't restrict; UI in Section T4 supports both "transfer ownership" (replaces) AND "promote to co-owner" (adds). Always-≥1-owner invariant remains. Two-PI labs handled cleanly.
4. ✅ **Personal-mode `/me/memberships` route.** Consistent with V1.13.0's Personal-mode routing (`/home`, `/me`, `/notifications`). Adds a small "Workspaces" link from Settings · Account too for findability.
5. ✅ **Audit-trail events in Activity feed + filterable.** Member-management events (`member_added` / `member_role_changed` / `member_removed` / `ownership_transferred` / `member_left`) emit via the V1.7 `activity_event` table per ADR-0015 patterns. Visible in workspace Activity feed by default. Owners/admins can filter them out via a new per-workspace activity-filter preference in Settings · Workspace.

All locked into the body sections + ADR-0046 scope.

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

- **Workspace-level email template editor** (owner-confirmed deferral 2026-06-15) — researchers customize the invitation email body per-workspace. V1.14 ships per-invite "personal message" field only; workspace-level templates land V1.14.1+ if requested.
- **Cross-workspace user search** (find researchers across workspaces) — V1.15+; needs a privacy review.
- **Workspace deletion flow** — V1.14.1 or later; needs care around data preservation + member notifications.
- **Workspace creation flow improvements** — `+ New workspace` exists today; this V1.14 doesn't add to it.
- **External (non-Clerk) invitations** — invite by sharing a link only (no email). Defer; the magic-link approach is the primary path.
- **Per-study role overrides** — a member's role per study (researcher might be Editor on Study A but Viewer on Study B). Currently roles are workspace-wide. Deferred to V1.16+ if requested.
- **Team-level activity dashboard** — a "what's our team done this week" surface. Could overlap with V1.13.0's workspace dashboard "team-activity" widget; if researchers want more, build in V1.14.1.
- **Invitee preview** — letting someone preview a workspace before accepting (peek at studies). Deferred; security-sensitive.
- **Hard-delete of removed members** — V1.14 ships soft-delete only (owner-confirmed). Hard-delete reserved for GDPR right-to-erasure handled out-of-band; if/when GDPR requests become routine, build a dedicated owner-only "purge member" flow in a later release.

When green: ping owner. Owner runs a quick smoke test (invite a colleague's email, walk through the magic-link flow, accept, verify role applied); signs the audit log; tags `v1.14.0`.
