# Wireframe spec — Team destination

- **Serves user flow:** [Manage team members](../../02_product/user-flows/manage-team-members.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Principal investigator](../../02_product/personas/principal-investigator.md)
- **Status:** draft

## Purpose

The workspace-mode destination for managing who's on the team and what they can do — the home for the (until now inert) LeftRail **Team** entry.

## Layout

Standard workspace destination chrome (LeftRail + focused top bar). Main column:

- **Header row:** "Team" title + one-line subtitle ("People in {workspace} and what they can do.").
- **Sub-nav tabs:** **Members** (default) · **Invitations** · **Roles & permissions**. Same tab treatment as the Studies sub-nav / Activity tabs.
- **Tab panel:** the active sub-view fills the column. Members + Invitations are list scaffolds (card-or-table); Roles & permissions is a static matrix.

## Content inventory

- **Title + subtitle** — static.
- **Sub-nav tabs** — static set of 3; the active tab is reflected in the URL (`/team`, `/team?tab=invitations`, `/team/roles`).
- **Tab panel** — delegated to [team-members](team-members.md) / [team-invitations-tab](team-invitations-tab.md) / [team-role-management](team-role-management.md) (Roles reference table).
- **Invitations tab badge** — count of pending invitations (computed; hidden when 0).

## States

- **Default** — Members tab active.
- **Loading** — per-tab skeleton (handled by each sub-view).
- **Empty** — single-member workspace: Members tab shows its empty state (see team-members); Invitations shows "No pending invitations."
- **Partial** — one tab loaded, another not yet visited (tabs fetch on activation).
- **Error** — per-tab inline error with retry (each sub-view owns its error state).

## Interactions

- **Tab click** — switches the panel + updates the URL (shareable/deep-linkable); no full reload.
- **+ Invite member** (owner/admin only) — lives in the Members + Invitations tabs' action bar; opens the invite modal ([team-invite-modal](team-invite-modal.md)).

## Edge cases

- A viewer/editor sees the destination read-only (no invite/manage affordances); the Roles tab still informs them what each role can do.
- Deep-link to `/team?tab=invitations` as a non-admin → tab visible but actions hidden; the list still renders (read).
- Very long workspace name in the subtitle → truncate.

## Accessibility notes

- Sub-nav is a `role="tablist"` with `role="tab"`/`aria-selected`, matching the Activity destination pattern; arrow-key navigation between tabs.
- The pending-invitations count badge pairs a number with an `aria-label` ("3 pending invitations"), never color-only.

## Open questions

- None blocking. Roles tab lives at `/team/roles` (its own route) vs a tab param — implementation detail; either is fine.
