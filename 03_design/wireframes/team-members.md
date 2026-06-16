# Wireframe spec — Team members list

- **Serves user flow:** [Manage team members](../../02_product/user-flows/manage-team-members.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Principal investigator](../../02_product/personas/principal-investigator.md)
- **Status:** draft

## Purpose

List every active member of the workspace with their role + activity, and surface the management actions the viewer is allowed to take.

## Layout

- **Action bar (top-right):** **+ Invite member** (owner/admin only) · search (name/email) · filter (role / status / contribution count) · sort (name / joined / last active / contributions).
- **List:** one row/card per active member, ordered by the chosen sort. Card-or-table responsive — table on wide, stacked card on narrow.

## Content inventory

- **Avatar** — Clerk-hosted `user.avatarUrl` (fallback initials).
- **Display name + email + affiliation badge** — from `user`.
- **Role chip** — Owner / Admin / Editor / Viewer; color + text (never color-only); click → role description popover.
- **Status** — Active / Inactive (last activity > 30 days); computed `lastActiveAt` = max(recent comments / edits / sign-ins for this user in this workspace).
- **Joined date + Last active** — relative time.
- **Per-row action menu** — gated by viewer role (see Interactions).
- **Result count** — "N members".

## States

- **Default** — populated list.
- **Loading** — row skeletons.
- **Empty** — single-member workspace, no invites: "You're the only person here. Invite teammates to start collaborating." + prominent **Invite member** CTA.
- **Filtered-empty** — "No members match your filters." + clear-filters link.
- **Error** — inline alert + Retry.

## Interactions

- **Row click** — opens the member detail ([team-member-detail](team-member-detail.md)).
- **Action menu** — Owner viewing: Change role / Remove / Transfer ownership / Make co-owner. Admin viewing: Change role (≤ Editor; not Owner) / Remove (Editor/Viewer only). Editor/Viewer viewing: menu absent (row still opens detail). All sensitive actions confirm; see [team-role-management](team-role-management.md).
- **+ Invite member** — opens [team-invite-modal](team-invite-modal.md).
- **Search / filter / sort** — client-side over the loaded list (the list is workspace-scoped + not huge); reflected in the result count's `aria-live`.

## Edge cases

- Removed members are hidden by default (`team.list()` filters `removed_at`); an audit toggle ("Show removed") surfaces them as tombstoned rows ("Maya Okonkwo · left 2026-04-12") with no actions.
- A member with no recent activity → "Inactive" + "Last active —".
- Long names/emails/affiliations → truncate with title attr.
- Large team (100s) → list virtualization deferred; pagination footer if it grows (reuse the dashboard PaginatedList pattern).

## Accessibility notes

- The list is a real `<table>` (or an ARIA grid) with a header row; row actions reachable by keyboard; the action menu is a proper menu button.
- Role chips + status carry text, not just color; the role popover is keyboard-dismissible.

## Open questions

- None blocking. "Inactive after 30 days" threshold is a starting value; tune if researchers find it noisy.
