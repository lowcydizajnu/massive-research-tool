# Wireframe spec — Team role management

- **Serves user flow:** [Manage team members](../../02_product/user-flows/manage-team-members.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Principal investigator](../../02_product/personas/principal-investigator.md)
- **Status:** draft

## Purpose

The sensitive operations — change role, remove, transfer/co-own, self-leave — each gated and confirmed, plus the static Roles & permissions reference.

## Layout

Not a page of its own (except the **Roles & permissions** reference tab); a set of dialogs launched from the Members list + member detail.

- **Change-role control** — a dropdown of valid target roles (filtered by the viewer's permissions + invariants).
- **Confirmation dialogs** — Remove, Transfer ownership, Make co-owner, Leave workspace.
- **Roles & permissions tab** (`/team/roles`) — a static permissions matrix (Action × Owner/Admin/Editor/Viewer).

## Content inventory

- **Role dropdown** — target roles allowed for this (viewer, target) pair.
- **Remove dialog** — copy: "Remove {Name} from {Workspace}? They'll lose access to all studies here. Their authored studies stay (ownership transfers to the workspace owner)." → soft-delete.
- **Transfer-ownership dialog** — picker (an admin or another owner) + two-step confirm: "You'll become an Admin; {Name} will become the Owner."
- **Make-co-owner dialog** — picker (an admin) + confirm: "{Name} will become a co-owner with full workspace permissions."
- **Leave dialog** — "Leave {Workspace}? You'll lose access to all studies. To rejoin you'll need a new invitation."
- **Permissions matrix** — static, derived from the role registry.

## States

- **Default** — dialog with valid options.
- **Submitting** — primary button spinner; inputs disabled.
- **Blocked (invariant)** — last-owner guard: "A workspace needs at least one owner — transfer ownership first." (inline, not a thrown error).
- **Success** — toast + the list/detail refetch; the relevant audit event emits.
- **Error** — inline alert + retry.

## Interactions

- **Change role** — `team.changeRole({ memberId, newRole })`; server validates the (viewer, target, newRole) rule + the ≥1-owner invariant. `newRole:'owner'` backs both transfer (old owner → admin in the same txn) and co-owner (add). Emits `member_role_changed` / `ownership_transferred` / `co_owner_promoted`.
- **Remove** — `team.removeMember({ memberId })` soft-deletes (`removed_at` + `removed_by_user_id`); emits `member_removed`; member tombstones in historical rows.
- **Leave** — `team.leaveWorkspace()` (actor = self); sole-owner blocked; emits `member_left`.
- **Roles matrix** — read-only reference; links from the invite modal's role select ("what can each role do?").

## Edge cases

- Admin attempts to change/remove an Owner or promote to Admin/Owner → options absent; server rejects (defence-in-depth).
- Demote/remove/leave the only owner → blocked with the guard message; offer Transfer.
- Target accepted/changed between open + submit → server re-validates; stale action fails gracefully + refetches.
- Transfer to a member who is mid-removal → not offered.

## Accessibility notes

- Destructive dialogs use the danger treatment; primary action is not the default-focused button (focus lands on Cancel for Remove/Leave).
- The permissions matrix is a real `<table>` with row + column headers; ✓/— have text equivalents (aria-label "allowed"/"not allowed").

## Open questions

- None blocking. Transfer vs co-owner share `changeRole({newRole:'owner'})`; the two dialogs just frame intent.
