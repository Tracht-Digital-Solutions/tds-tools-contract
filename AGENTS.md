# AGENTS.md — tds-tools-contract

Authoritative architecture/gotcha doc for this repo. Read before non-trivial changes.

## What this is

The **tools-platform contract**: the SDK the public tools site (`tds-tools`) and
every tool package (`tds-tool-*`) build against. It is the frontend-only twin of
`tds-panel-contract` — modelled directly on it (`defineExtension`→`defineToolPack`,
`composeExtensions`→`composeToolPacks`, `panelHost`→`toolHost`).

## Architecture

- **Build-time composition, not runtime plugins.** The site imports each pack's
  `ToolPackManifest` and `composeToolPacks` folds them into one `ComposedCatalog`.
  Composition happens during `astro build` (`output:static`, no Node on prod).
- **Frontend-only.** No PHP half (unlike `tds-panel-contract`). The dynamic bits
  — admin-controlled catalog (enabled/requires-login/premium/price) and the
  entitlement + Stripe checkout — live in the **`tds-ext-tools`** panel
  extension + `tds-core-panel-api`. A tool declares only *defaults*
  (`requiresLoginDefault`, `premiumDefault`, `priceCentsDefault`); the admin
  catalog overrides them at runtime (merged in the site's `catalog.ts`).
- **Two virtual modules** (`src/astro.ts`): `virtual:tools-catalog` (data) and
  `virtual:tools-components` (generated static imports → `id → Component` map).
  The `[slug]` route template + catalog index live in the **site**, not here, so
  they can use the site's Layout/SEO/ad-slots/premium-gate chrome. `toolHost`
  only registers the Vite plugin.
- **Dependency-free.** `astro.ts` models Astro's integration + Vite plugin shapes
  structurally (`AstroIntegrationLike`, `VitePluginLike`) so the package builds in
  isolation — do not add an `astro` dependency.

## Gotchas / invariants

- **Tool `id` AND `slug` are globally unique across all composed packs.** A
  collision in either is a hard build error (`composeToolPacks` throws) — the
  frontend twin of the Phinx "unique migration class name" rule. Keep them unique.
- **`component` is a package subpath**, resolved via the package `exports`
  (`@…/tds-tool-x/tools/X.astro`), never a local relative path.
- **Stable at 1.x.** Consumers pin `^1.0.0`; ship additive minors, never a
  breaking change in the 1.x line without a major.
- **CI is npm-only** (`_build.yml` has no PHP steps). `npm install
  --no-package-lock`, never `npm ci`. Release bumps `package.json` only (no
  `composer.json` half to keep in lockstep), pushes an **annotated** tag.
- Labels/names/descriptions are **German editable copy** — they live in the
  manifest, never inlined in a site page.

## Commands

```bash
npm install
npm run build        # tsup → dual ESM+CJS + d.ts (index + astro/index)
npm run type-check
npm run test:run     # vitest — composeToolPacks collision/cycle/order coverage
```

Release via the manual GitHub "Release" button (bumps + publishes @latest).
