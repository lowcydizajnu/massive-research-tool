# 05_app — Massive Research Tool MVP

Phase 5 (Build) scaffold per [ADR-0011](../04_architecture/adrs/0011-scaffold-strategy.md).

## What's in this first commit

- Next.js 15 (app router) + React 19 + TypeScript.
- Tailwind v4 (CSS-driven config; no `tailwind.config.ts` needed).
- IBM Plex Sans / Serif / Mono via `next/font/google` (no CDN dependency at runtime).
- The full v0.6 token system at `styles/tokens.css` — Light + Dark CSS variables, mapped 1:1 from `../03_design/design-system/tokens.md`.
- `ThemeProvider` (`components/theme-provider.tsx`) — reads localStorage today, will read Clerk user metadata in the next iteration. Honors `prefers-color-scheme` when choice is `system`.
- `ThemeToggle` (`components/theme-toggle.tsx`) — three-card picker matching the signup-onboarding and account-settings wireframes.
- A static verification page at `/` showing parchment + Plex Serif + theme toggle + palette swatches + a demo block-validation row, so we can confirm at a glance that the design language renders correctly in both modes.

## What's deliberately NOT here yet

Per ADR-0011 the next iterations add:

- Clerk auth + sign-in / signup routes.
- Drizzle schema + Postgres + the first migrations.
- tRPC routers (workspace, studies, library).
- Real Studies destination, New study modal, Builder mode, Save dialog, Module picker.
- Playwright e2e covering Hanna's full MVP loop (failing test first, then features).

## Prerequisites

- Node ≥ 20.10 (Next.js 15 requirement).
- npm or pnpm (commands below use npm).

## Quick start

```bash
cd "05_app"
cp .env.example .env.local   # leave the Clerk/DB keys blank for now
npm install
npm run dev
```

Visit <http://localhost:3000>. You should see:

- A warm parchment background.
- A `Build studies. Document everything.` headline in Plex Serif.
- A theme picker with three cards (Light / Dark / System).
- Clicking Dark immediately flips the whole surface to warm-dark.
- A palette grid showing the polarized two-stop ramps.
- A block-validation demo row with one vibrant emerald `schema valid` badge and one vibrant red `missing field` badge.

If any of those look off, that's the design language not rendering correctly — say so and we adjust before building features.

## Dropbox warning

This repo sits inside Dropbox. Dropbox will try to sync `node_modules` (huge, slow, often locks files). Two options:

1. Tell Dropbox to ignore `05_app/node_modules`:
   ```bash
   xattr -w com.dropbox.ignored 1 "05_app/node_modules"
   ```
2. Or move `05_app/` outside Dropbox entirely — symlink back into the project if you want one path.

Option 1 is enough for now.

## Layout (from ADR-0011 — what's there + what's planned)

```
05_app/
├── app/
│   ├── layout.tsx          ✅ ThemeProvider wraps everything
│   ├── page.tsx            ✅ verification page (temporary)
│   ├── globals.css         ✅ Tailwind v4 + token bridge
│   ├── (auth)/             ⏳ /signup, /sign-in — next iteration
│   ├── (app)/              ⏳ authenticated routes — next iteration
│   └── api/trpc/[trpc]/    ⏳ tRPC handler — next iteration
├── components/
│   ├── theme-provider.tsx  ✅
│   ├── theme-toggle.tsx    ✅
│   ├── ui/                 ⏳ shadcn primitives — next iteration
│   ├── chrome/             ⏳ TopBar, LeftRail, etc. — next iteration
│   └── feature/            ⏳ StudyCard, ModulePicker, etc. — next iteration
├── server/                 ⏳ db, trpc, adapters, modules — next iteration
├── styles/
│   └── tokens.css          ✅ source of truth for color, type, spacing, etc.
├── tests/                  ⏳ unit, integration, e2e — next iteration
├── lib/
│   └── utils.ts            ✅ cn() helper
├── package.json            ✅
├── tsconfig.json           ✅
├── next.config.ts          ✅
├── postcss.config.mjs      ✅
├── components.json         ✅ shadcn config
└── README.md               ✅
```

## Conventions (from the original scaffold notes)

- Layout follows feature folders, not technical layers (`features/experiments/`, not `controllers/`).
- Tests live next to the code they test (`foo.ts` + `foo.test.ts`).
- Each feature folder has its own `README.md` describing what it owns.
- No file over ~250 lines without a justified exception.
- `.env.example` is the single source of truth for required environment variables.

## Token contract

If you need a color, type size, spacing, radius, or motion duration:

1. Read `../03_design/design-system/tokens.md` for the design intent.
2. Reference the corresponding CSS variable via either:
   - Tailwind utility: `bg-surface-page`, `text-text-primary`, `font-serif`, etc.
   - Inline CSS variable: `style={{ backgroundColor: "var(--color-surface-page)" }}`.
3. Never write a raw hex. Lint will catch this once we add the rule.

If a token is missing, add it to `styles/tokens.css` (both Light and Dark in the same change per the brief's hard rules) and to `../03_design/design-system/tokens.md`.

## Sources

- [ADR-0011 — Scaffold strategy](../04_architecture/adrs/0011-scaffold-strategy.md)
- [Design-language brief v0.6](../03_design/design-language-brief.md)
- [Tokens](../03_design/design-system/tokens.md)
- [STACK.md](../STACK.md)
