# ADR 0082 — Privacy & operator-access model

- **Status:** accepted
- **Date:** 2026-06-29
- **Deciders:** project owner, Claude
- **Tags:** privacy, auth, security, runtime

## Context

The owner asked, plainly: *would a researcher be skeptical to run sensitive or innovative work on MRT, and what can we offer to earn that trust?* The trigger was the **"View as researcher"** operator tool (ADR-0075): it is already read-only, admin-only, server-re-checked, and audit-logged, but an operator who can silently see everything a researcher sees — including **raw participant responses** — is a real trust liability for sensitive studies, however well-intentioned.

This ADR settles the **privacy posture** as an architectural commitment so downstream surfaces (a public "Security & data" page, the View-as implementation, future data-lifecycle features) all build to the same contract, rather than each making ad-hoc promises. It builds on what already exists: PII-minimization (UA one-way-hashed, coarse country only, never raw IP — `feedback`/rate-limit/recruitment), app-level encryption of vendor tokens, RBAC via workspace roles, audit logs (`legal_acceptance`, `admin_view_as_log`, member events), a single-source sub-processor list (`lib/legal/subprocessors.ts`, ADR-0073/LG5), and BYO-key integrations (OSF / Anthropic / Hume / Prolific).

## Options considered

### Option A — Remove "View as" entirely
- Operators never see researcher state; support is screen-share only.
- **Pros:** strongest possible privacy claim ("no operator access, ever").
- **Cons:** kills the legitimate support/debug path; screen-share leaks *more* (live participant data, on a call) and isn't audit-logged; throws away a working, already-conservative feature.

### Option B — Keep "View as" as-is
- Read-only + audit-logged is "good enough."
- **Pros:** no work.
- **Cons:** still exposes raw participant data; silent (researcher never knows); no per-workspace control — exactly the skepticism the owner named.

### Option C — Keep, but tighten to "consent-and-audit support access" (chosen)
- Read-only (unchanged) **and**: exclude raw participant response data from the impersonated view; require a typed reason to enter (break-glass); make every session visible to the researcher (transparency, not just an internal log); let a workspace require explicit approval / opt out.
- **Pros:** preserves support while converting the feature into a trust *signal*; matches the industry "support access with consent + audit" norm (Stripe/Vercel-style); each guarantee is concretely truthful and documentable.
- **Cons:** more moving parts (a workspace flag + a data-scoping rule + researcher-visible log); marginally harder operator debugging when participant data is the issue (acceptable — that's the point).

## Decision

**We will treat operator access as consent-gated, data-minimized, transparent support access, and publish a plain-language privacy posture that we hold ourselves to (Option C).**

Concretely, the model has two halves:

1. **Operator access ("View as")** — stays read-only and audit-logged, and additionally: (a) **never exposes raw participant responses/PII** while impersonating (operator sees the researcher's *configuration, structure, and UI*, not response rows or exports); (b) **requires a typed reason** on entry (break-glass); (c) is **surfaced to the researcher** (a session they can see, not only an internal log); (d) is **gated by a per-workspace setting** so a workspace can require approval / disable support access for sensitive work.

2. **Privacy posture (the promises we keep)** — PII-minimization by default (no raw IP, hashed UA, coarse country; participant responses pseudonymous); encryption in transit (TLS) and at rest (provider-managed) plus app-level encryption of vendor tokens; **we do not use researcher or participant data to train AI models, and our AI sub-processors do not train on API inputs**; BYO-key for AI/recruitment/registry so the researcher owns the data path; researcher-controlled lifecycle (export + hard-delete + retention) as the committed direction; full sub-processor transparency; GDPR-aligned data-subject export/erasure.

The reasoning: for sensitive research the deciding questions are *where does my data live, who can see it, is it encrypted, can I delete it, do you train on it, are you GDPR/IRB-friendly* — so we answer all six truthfully in one place and make the one feature that contradicts "nobody can see my data" (View-as) provably safe and consensual.

## Consequences

- **Easier:** marketing/sales and IRB conversations get one authoritative "Security & data" page; new features inherit a clear privacy contract instead of inventing promises.
- **Harder:** View-as gains a data-scoping rule + a workspace flag + researcher-facing surfacing; we must keep the public page *accurate* as the system changes (it can only claim what the code does — never aspirational).
- **Committed to:** no participant-data exposure via operator access; honoring a workspace's support-access setting; not training on customer data; maintaining the sub-processor list; building export + hard-delete + retention controls.
- **Precluded from:** silent full-fidelity impersonation; any AI-training-on-customer-data arrangement; adding a sub-processor without listing it.

## Revisit triggers

- We pursue a formal certification (SOC 2 / ISO 27001) or HIPAA/BAA — that would supersede parts of this with audited controls.
- We add data-residency guarantees (EU-only hosting) or enterprise SSO/SCIM.
- A regulator or large institution requires a contractual DPA term this model doesn't cover.
- We introduce any feature that needs broader operator access (it must extend this ADR, not bypass it).

## References

- ADR-0075 (admin destination + read-only View-as), ADR-0073/LG5 (sub-processor single source), ADR-0014 (PII-safety), ADR-0007 (adapter/lock-in boundary).
- Code: `server/admin/view-as.ts`, `server/trpc/trpc.ts` (mutation block during impersonation), `lib/legal/subprocessors.ts`, `server/db/schema.ts` (`admin_view_as_log`, hashed-UA/coarse-country columns), `server/db/delete-demo.ts` (hard-delete plumbing to generalize for study data).
- To follow this ADR: the public **Security & data** docs page + the View-as tightening (data-scoping + reason + researcher-visible session + per-workspace support-access setting).
