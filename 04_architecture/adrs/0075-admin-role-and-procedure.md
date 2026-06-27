# ADR 0075 — Admin role via user.is_admin + adminProcedure; read-only view-as

- **Status:** accepted
- **Date:** 2026-06-27
- **Deciders:** Paweł Rosner (owner), Code tab
- **Tags:** auth, admin, data-model

## Context

Platform-foundation shipped `/admin/feedback` + `/admin/announcements` behind an **`ADMIN_USER_IDS` env allow-list** — a deliberate stopgap. The Analytics + Admin handoff promotes these into a real owner-facing **Admin destination** (overview, workspaces, users, failed jobs, cost rollups, view-as) that needs a durable, queryable admin flag and a single server-side gate. An env allow-list can't be joined in SQL, isn't visible to the DB, and re-deploys to change. We also want **read-only "view-as researcher"** for support debugging — but never act-as (writing on someone's behalf is too dangerous).

Existing authz: tRPC `protectedProcedure` (auth + local user) and `workspaceProcedure`/`writeProcedure` (membership/role). Admin is orthogonal to workspace membership — an admin is a platform operator, not a workspace role.

## Options considered

### Option A — `user.is_admin` boolean column + `adminProcedure` middleware (chosen)

- Add `user.is_admin BOOLEAN NOT NULL DEFAULT FALSE`; a new `adminProcedure` (extends `protectedProcedure`, throws `FORBIDDEN` unless `dbUser.is_admin`). Owner flips their own row TRUE once at deploy. View-as is a read-only, audit-logged impersonation that never grants writes.
- **Pros:** queryable (joins, census); one server gate reused by every admin route + the `/admin` layout; survives redeploys; matches the handoff.
- **Cons:** a migration + a manual prod row flip; one more procedure type.

### Option B — keep the `ADMIN_USER_IDS` env allow-list

- **Pros:** zero migration; already built.
- **Cons:** not queryable; editing requires an env change + redeploy; doesn't scale to the real Admin destination; can't power a Users census that marks admins.

### Option C — full role hierarchy (superadmin/support/…)

- **Pros:** future-proof for a support team.
- **Cons:** YAGNI for an indie solo; owner locked "admin/non-admin only, hierarchy is V2.x."

## Decision

**We will gate admin surfaces on a `user.is_admin` boolean via a new `adminProcedure`, transition the existing `/admin/*` pages + the `me.isAdmin` check to it (keeping the `ADMIN_USER_IDS` allow-list as a transitional fallback until the owner's row is flipped), and add read-only view-as with an audit log — never act-as.**

`adminProcedure = protectedProcedure` + `if (!ctx.dbUser.isAdmin) throw FORBIDDEN`. The `/admin` layout and `me.isAdmin` resolve admin as `is_admin || ADMIN_USER_IDS.has(externalId)` during the transition, then drop the env fallback once the column is seeded in prod. **View-as** sets a signed, time-boxed, read-only impersonation context that the write procedures (`writeProcedure`) explicitly reject, and every entry/exit writes an audit row — so support can see what a researcher sees without any ability to mutate their data.

## Consequences

- **Easier:** a single admin gate across all admin routes + tRPC; a Users census that can show/seed admins; safe support debugging.
- **Harder / committed:** a migration + a one-time prod row flip; the discipline that view-as must hard-block writes (tested); admin remains binary.
- **Precluded:** act-as / writing on behalf of a researcher (explicitly out, permanently); multi-tier admin roles (deferred to V2.x).

## Revisit triggers

- A support team beyond the owner needs scoped permissions → introduce a role hierarchy (supersedes the binary flag).
- View-as proves insufficient for debugging without writes → revisit (with a very high bar, given the danger).

## References

- Handoff: `04_architecture/handoffs/code-tab-analytics-admin.md` (Section AA2).
- Supersedes the `ADMIN_USER_IDS` stopgap from ADR-0072 (platform-foundation). [[0072-platform-foundation]].
- Builds on [[0007-path-a-vs-b]] (tRPC procedure layering), ADR-0014 (PII boundary — view-as is read-only).
