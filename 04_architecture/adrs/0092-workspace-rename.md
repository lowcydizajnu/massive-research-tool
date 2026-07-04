# ADR 0092 — Workspace rename (name-only, slug stable)

- **Status:** accepted
- **Date:** 2026-07-04
- **Deciders:** Paweł Rosner
- **Tags:** data-model, workspace, settings

## Context

The new **Workspaces** tab in Account settings (owner request 2026-07-04) lists the researcher's active workspaces and needs an inline **rename** control. No rename capability existed — the `workspace` router had `create`, `archive`, `unarchive`, and `list`, but nothing to change a workspace's display name after creation. A `workspace` row carries both a human `name` and a URL `slug` (generated from the name at creation, collision-suffixed). This ADR settles what "rename" changes and who may do it.

## Options considered

### Option A — Rename changes `name` only; `slug` is immutable

- The mutation updates `workspace.name`. The `slug` (set once at creation) never changes.
- **Pros:** URLs, bookmarks, and any slug-based references keep working; rename is a pure cosmetic relabel with zero blast radius; matches how most tools treat a handle/slug vs a display name.
- **Cons:** The slug can drift from the current name (e.g. "Lab A" renamed to "Misinfo Lab" keeps slug `lab-a`). Slugs are not user-facing in this app (the switcher shows `name`), so drift is invisible in practice.

### Option B — Rename regenerates the `slug` from the new name

- Update `name` and recompute + re-collision-suffix `slug`.
- **Pros:** Slug always reflects the current name.
- **Cons:** Breaks any URL/bookmark/deep-link built on the old slug; needs redirect handling; turns a cosmetic action into a destructive identifier change. Not worth it for a non-user-facing slug.

### Permission — who may rename

- **Owner-only** (matches `archive`/`unarchive`), or **owner + admin** (matches the other workspace-settings mutations `updateActivityFilter` / `setSupportAccessEnabled`, which are owner/admin write-gated).

## Decision

We will add `workspace.rename({ workspaceId, name })` that updates **`name` only** and leaves **`slug` immutable**, callable by a workspace's **owner or admin**.

Rename is a workspace *setting*, not a structural/lifecycle change, so it follows the owner-or-admin rule the other settings mutations use rather than the stricter owner-only rule of archive. It is a `protectedProcedure` (cross-workspace, like `unarchive`) — the target is picked from the settings list and may not be the active workspace, so it resolves the caller's membership role in the target explicitly. Keeping the slug stable means rename can never break a link, so it needs no redirect handling and emits no lifecycle event (unlike create/archive).

## Consequences

- **Easier:** Researchers can relabel workspaces from one place; the settings list reuses the existing `workspace.list` data.
- **Harder:** Nothing material. Slug drift is possible but invisible (slugs aren't shown or routed on by name).
- **Committed to:** `name` and `slug` are decoupled after creation; `slug` is a create-time stable identifier.
- **Precluded from:** Auto-syncing slug to name. If slugs ever become user-facing/routable-by-name, revisit with a redirect strategy.

## Revisit triggers

- Slugs become user-visible or routable such that a stale slug confuses users.
- We introduce vanity workspace URLs the user expects to track the name.
- A need for a rename audit trail (would add a `workspace_renamed` analytics event + changelog entry).

## References

- `05_app/server/trpc/routers/workspace.ts` — `rename` (mirrors `unarchive`'s cross-workspace resolve + role check).
- ADR-0090 (workspace archive) — the sibling reversible workspace operation.
- `05_app/components/feature/settings/workspaces-section.tsx` — the Workspaces-tab UI that calls it.
