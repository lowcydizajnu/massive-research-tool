# Wireframe spec — Workspace archive & restore

- **Serves user flow:** [Archive & restore a workspace](../../02_product/user-flows/archive-a-workspace.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

Give a workspace owner one clear, reversible way to remove a workspace from their
switcher (archive) and a calm place to bring it back (restore) — without ever implying
that data is being deleted.

## Layout

Two surfaces, no new routes:

1. **Archive — `/settings/workspace` (workspace Settings), bottom of the page.** A single
   low-emphasis card titled **"Archive this workspace"**, visually separated from the
   editable settings above (a hairline divider; muted, not a loud red "danger zone" — the
   action is reversible, so it should read as tidy-up, not destruction). Left: heading +
   one-line explanation. Right: an **Archive workspace** button (secondary/outline, not a
   primary emerald CTA). Owner-only — the whole card is absent for non-owners.

2. **Restore — `/settings/account` (Account settings), an "Archived workspaces" section.**
   A titled section that renders only when the user owns ≥1 archived workspace. A simple
   list; each row: workspace name, "Archived {relative date}", study count, and a
   **Restore** button (outline). Below the list, one muted line: "Archived workspaces are
   hidden from your switcher. Nothing in them is deleted."

The **confirm dialog** (triggered from surface 1) is a standard modal: title "Archive
'{name}'?", body naming the contents, **Archive** (confirm) + **Cancel**.

## Content inventory

- **Section heading "Archive this workspace"** — static.
- **Explanation line** — static: "Hides this workspace and everything in it from
  everyone. Nothing is deleted — you can restore it anytime from Account settings."
- **Archive workspace button** — static label; disabled + hinted when a guard fails.
- **Guard hint** — computed, from server preconditions: "This is your only workspace —
  create another first." or "Stop recruitment on '{study}' before archiving." (shown in
  place of / beneath the button when disabled).
- **Confirm dialog title/body** — computed: workspace name + study count ("{N} studies
  will be hidden — you can restore them anytime").
- **Archived-workspaces list rows** — from server (`workspace.listArchived`): name,
  `archivedAt` (relative), study count.
- **Restore button** (per row) — static label.
- **Toasts** — computed: "'{name}' archived — restore it in Account settings." /
  "'{name}' restored." / error reasons.

## States

- **Default (archive card):** enabled button, owner has other workspaces, nothing
  recruiting.
- **Disabled (archive card):** last-workspace or recruiting guard → button disabled +
  the matching hint. (Server still re-checks; the disable is UX, not the gate.)
- **Hidden (archive card):** viewer is not the owner → card not rendered.
- **Loading:** archive/restore in flight → button shows pending spinner (PendingButton);
  the rest stays interactive.
- **Empty (restore section):** user owns no archived workspaces → the whole "Archived
  workspaces" section is omitted (no empty-state card needed on the account page).
- **Error:** mutation rejects → inline error in the dialog (archive) or a toast (restore);
  no state change.
- **Success:** archive → navigate away (to next workspace / Home) + toast; restore → row
  disappears from the list + toast.

## Interactions

- **Archive workspace button** — click → open confirm dialog. Disabled state carries the
  guard hint; no dialog opens.
- **Confirm (in dialog)** — click → `workspace.archive`; on success close dialog, route to
  the fallback workspace's `/dashboard` (or `/home`), toast. On rejection, show the
  server's reason inline; keep the dialog open.
- **Cancel** — close dialog, no change; focus returns to the Archive button.
- **Restore (per row)** — click → `workspace.unarchive`; on success remove the row +
  toast; the workspace re-appears in the switcher on next open. On error, toast + keep the
  row.

## Edge cases

- **Very long workspace name** — truncate with ellipsis + `title` in the card heading,
  dialog title, and list rows; never wrap the button off-screen.
- **Many archived workspaces** — the list scrolls within the section (its own
  `overflow-y: auto`), the account page body never grows unbounded.
- **Zero / one workspace** — one workspace → archive disabled (last-workspace guard);
  zero archived → restore section omitted.
- **Slow network** — PendingButton spinner + disabled during the mutation; no double-submit.
- **Concurrent** — a second tab that already restored the workspace → the other tab's
  restore is a no-op (idempotent clear); archiving an already-archived workspace is a
  no-op success.
- **Permissions** — a non-owner who forges the mutation gets `FORBIDDEN` server-side; the
  UI never shows them the control.

## Accessibility notes

- The confirm dialog is a focus-trapped modal (`role="dialog"`, `aria-modal`, labelled by
  its title); Esc cancels; focus starts on Cancel (safe default for a state-changing
  action) and returns to the Archive button on close.
- The disabled Archive button keeps its guard hint associated via `aria-describedby` so
  screen-reader users hear *why* it's disabled.
- Restore buttons have accessible names that include the workspace ("Restore {name}")
  since the visible label repeats per row.
- Respect `prefers-reduced-motion` on the toast/dialog transitions.

## Open questions

- Should the archive card live at the bottom of `/settings/workspace` or in a dedicated
  "Danger/lifecycle" subsection? Leaning bottom-of-page, muted (it's reversible). Owner to
  confirm during the design-system pass.
- Do we want a switcher-level "Show archived" affordance in addition to the account-page
  list? Deferred unless requested (flow Open question).
