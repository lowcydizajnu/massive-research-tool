# Wireframe spec — Team member detail

- **Serves user flow:** [Manage team members](../../02_product/user-flows/manage-team-members.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Principal investigator](../../02_product/personas/principal-investigator.md)
- **Status:** draft

## Purpose

A read-mostly view of one member — their profile, their contributions to this workspace, and (for admins/owners) the role + access controls.

## Layout

Route `/team/[memberId]` (or a slide-over from the Members list). Sections top to bottom:

- **Header** — avatar + display name + email + role chip + joined-date + last-active.
- **Profile card** — read view of `user` profile fields (V1.12 §A2): full name, affiliation, ORCID (links to orcid.org), bio, research-area chips, website + Scholar URLs. "View public profile" reserved for a future cross-workspace profile (V1.15+).
- **Contributions in this workspace** — studies authored (count + recent list, each linking to the study), studies replicated (count), comments + mentions (count), versions saved (count), and a small 30-day activity histogram by type.
- **Role + access** (admin/owner viewing only) — current role + permissions summary; Change role; Remove from workspace; Transfer ownership / Make co-owner (owner viewing, target is admin).
- **Activity timeline** (sub-tab) — last 50 `activity_event`s where this member is the actor, scoped to this workspace.

## Content inventory

- **Header + profile fields** — from `team.get({ memberId })` (member + user).
- **Contribution counts + recent studies** — computed in `team.get`.
- **Activity histogram + timeline** — from `team.memberActivity({ memberId, limit })`.
- **Role/access controls** — gated; render only for admin/owner viewers.

## States

- **Default** — populated.
- **Loading** — header + card skeletons.
- **Empty contributions** — "No contributions in this workspace yet."
- **Removed member** — tombstone banner ("Left this workspace on {date}") + read-only profile + historical contributions; no role/access controls.
- **Error** — inline alert + Retry; not-found / cross-workspace member id → friendly "Member not found in this workspace."

## Interactions

- **Change role / Remove / Transfer / Make co-owner** — open the dialogs in [team-role-management](team-role-management.md); gated by viewer role + the always-≥1-owner invariant.
- **Self-view** — when viewing yourself, the controls show **Leave workspace** (sole-owner blocked) instead of Remove.
- **Study links** — navigate to the study (Build stage).
- **ORCID / website / Scholar** — open in a new tab (`rel="noopener"`).

## Edge cases

- Viewing self as the sole owner → Leave is disabled with "Transfer ownership or delete the workspace first."
- A member who authored studies then was removed → studies remain (ownership transfers to the workspace owner per the remove copy); the detail shows them tombstoned.
- Profile fields unset → omit the row (don't render empty labels).

## Accessibility notes

- Histogram has a text/table equivalent (counts by type) for screen readers.
- The role/access actions are clearly grouped + labelled; destructive actions (Remove) use the danger treatment + confirm.

## Open questions

- Route vs slide-over is an implementation choice; route is deep-linkable (preferred). Public cross-workspace profile is out of scope (V1.15+).
