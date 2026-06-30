# Data model — Social-post design (Facebook v1)

> Implements [ADR-0085](../adrs/0085-social-post-design-builder.md) (builder) and [ADR-0084](../adrs/0084-social-post-branding-tiers-irb.md) (branding tiers + IRB gate). **No migration.** Like `overview`/`groups`/`theme` (ADR-0012/ADR-0024), all of this rides `experiment_version.definition_snapshot` (study-default appearance under `theme.socialPost`) and the `social-post` block's existing `config` (per-block content + overrides). It therefore freezes with preregistration, copies on fork, and is captured by the protocol-text diff for free. Zod allowlists at the tRPC layer are the source of truth (mirrors ADR-0024); there is no DB column and no JSON-Schema migration.

## `theme.socialPost` — study-level defaults (snapshot, optional)

| Field | Type | Notes |
| --- | --- | --- |
| `brandingTierDefault` | `'block' \| 'layout' \| 'branded'` default `'block'` | Study default; a block may override (see below). `effectiveTier(block) = block.brandingTier ?? theme.socialPost.brandingTierDefault`. ADR-0084. |
| `reactionsEnabled` | `ReactionKey[]` | Subset of the seven `like \| love \| care \| haha \| wow \| sad \| angry`. Order is display order; empty = reactions hidden. |
| `reactionsLive` | `boolean` default `true` | When true the reaction picker is **measured** (extends the response); when false it renders display-only. |
| `showReactionSummary` | `boolean` default `true` | The "👍😆 + N others" summary row. |
| `actionBar` | `{ react: boolean; comment: boolean; share: boolean }` | Which action-bar buttons render. |
| `comments` | `CommentThreadConfig` (below) | The thread anatomy + seeded comments. |
| `composer` | `{ enabled: boolean; placeholder?: string; slots: ('emoji'\|'photo'\|'gif'\|'sticker')[] }` | The "Write a comment…" affordance + which composer icons show. `placeholder` overrides the wording default. |
| `slots` | `CustomSlot[]` | Researcher-defined custom elements (below). Study-level defaults; a block may add its own. |
| `irbAttestation` | `IrbAttestation \| null` (below) | Present once a researcher attests IRB approval for branded use. **Hard-gated** at publish/run when any block is effectively `branded`. ADR-0084. |

Absent `theme.socialPost` → the current ADR-0024 `facebook` override behavior (back-compat; old snapshots unaffected).

## `social-post` block `config` additions (per-block, snapshot)

> Augments the existing v2 config (headline/body/source/veracity/counts/authorHandle/timeLabel/allowComments/emotionAnalysis — see `02-module-entities.md` / registry).

| Field | Type | Notes |
| --- | --- | --- |
| `brandingTier` | `'block' \| 'layout' \| 'branded'` optional | Per-block override of `theme.socialPost.brandingTierDefault`. |
| `brandLogoKey` | `mediaUrl` (R2 key) optional | Researcher-uploaded logo/marks. **Required** when effective tier is `branded` (ADR-0003 presign; orphan-safe — missing key falls back to `layout` render + fails preflight). We never ship trademarked assets. |
| `slots` | `CustomSlot[]` optional | Per-block custom slots, appended to the study-level slots. |

## Embedded shapes

**`CommentThreadConfig`**

| Field | Type | Notes |
| --- | --- | --- |
| `enabled` | `boolean` | Render the thread at all. |
| `seeded` | `SeededComment[]` | Authored comments. Each `{ id, authorName, authorAvatarKey?, topFan?: boolean, verified?: boolean, body, timeLabel?, reactionCount?, reactions?: ReactionKey[], replies?: SeededComment[] }` (one level of nesting in v1). |
| `viewMoreLabel` | `string?` | "View more comments" (wording default if blank). |
| `countLabel` | `string?` | "1 of 98" style position label (purely cosmetic). |

**`CustomSlot`**

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | Stable id (for diff/preview keys). |
| `region` | `'header-badge' \| 'sponsored-label' \| 'below-body' \| 'pinned-comment' \| 'action-bar'` | Named insertion point in the FB layout. |
| `kind` | `'text' \| 'image' \| 'icon'` | Content type. |
| `content` | `string` | Text, an R2 media key (image), or an allowlisted icon key. Validated per `kind`. |

**`IrbAttestation`** (ADR-0084)

| Field | Type | Notes |
| --- | --- | --- |
| `attested` | `boolean` | Must be `true` to publish/run with a `branded` block. |
| `byUserId` | `uuid → user.id` | Who attested (audit). |
| `at` | ISO timestamp | When (audit; frozen in snapshot). |
| `statement` | `string` | The attestation text the researcher confirmed. |

**`ReactionKey`** = `'like' | 'love' | 'care' | 'haha' | 'wow' | 'sad' | 'angry'`.

## Response shape (when `reactionsLive`)

Extends the existing `social-post` response (`{ liked, shared, comment }`) with:

| Field | Type | Notes |
| --- | --- | --- |
| `reaction` | `ReactionKey \| null` | The single chosen reaction (radio-deselect via the scoped `reaction-toggles` client, ADR-0013 exception). `liked` stays for back-compat = `reaction != null`. |

Export (`dataset.ts`) gains a `reaction` column alongside `liked`/`shared`/`comment` (mirrors the V2.1 emotion-column pattern).

## Invariants & boundaries

- **Branded ⇒ gated.** `studies.setSocialPostDesign` / `setTheme` accept the tier, but `preregister` / `makeLive` / run-preflight **reject** (PRECONDITION_FAILED) any study where an effective-`branded` block lacks `brandLogoKey` **or** `theme.socialPost.irbAttestation.attested`. Mirrors the ADR-0024 unacknowledged-warned rejection and the ADR-0044 preflight.
- **Layout ⇒ acknowledged.** `layout`/`branded` still require the ADR-0024 `mimicAcknowledged` for the `facebook` preset.
- **Freeze/fork/diff.** Everything here rides the snapshot, so a frozen version keeps its design, a fork renders identically, and the protocol-text serializer can diff it.
- **No user code.** Reactions, thread, and slots are schema-validated data; renderers stay vetted in-repo (ADR-0024). No arbitrary HTML/CSS/remote assets.
- **Orphan-safe media.** A deleted `brandLogoKey`/`authorAvatarKey`/image-slot key degrades gracefully (ADR-0024 avatar precedent) and is surfaced by preflight.
