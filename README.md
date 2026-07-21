# @tracht-digital-solutions/tds-tools-contract

The **tools-platform contract** — the SDK the public tools site (`tds-tools-frontend`) and
every tool package (`tds-tool-*`) build against. It is the tools-site twin of
`tds-panel-contract-pkg`, but **frontend-only**: pure TypeScript types +
build-time composition helpers. There is no runtime plugin loading — the site
imports each package's manifest and folds it into one static `dist/`.

> The admin-controlled catalog (enabled / requires-login / premium / price) and
> the entitlement + Stripe logic live in the **`tds-ext-tools-pkg`** panel extension,
> not here. A tool package declares only the **defaults**; the catalog overrides
> them at runtime.

## Install

```bash
npm install @tracht-digital-solutions/tds-tools-contract
```

Needs a GitHub PAT with `read:packages` (via `~/.npmrc` or the `NPM_TOKEN` env
var the repo `.npmrc` references) — the package lives on GitHub Packages.

## Authoring a tool package (`tds-tool-*`)

A package's entry exports one `ToolPackManifest` via `defineToolPack`. A single
package may register several related tools (a "pack"):

```ts
import { defineToolPack, defineTool } from "@tracht-digital-solutions/tds-tools-contract";

export default defineToolPack({
  id: "media",
  name: "Medien-Werkzeuge",
  version: "0.1.0",
  tools: [
    defineTool({
      id: "image-compress",
      slug: "bild-komprimieren",
      name: "Bild komprimieren",
      category: "media",
      description: "Bilder verkleinern & komprimieren — direkt im Browser.",
      icon: "image",
      keywords: ["bild", "komprimieren", "resize"],
      component: "@tracht-digital-solutions/tds-tool-media/tools/ImageCompress.astro",
    }),
    defineTool({
      id: "pdf-tools",
      slug: "pdf-werkzeuge",
      name: "PDF-Werkzeuge",
      category: "media",
      description: "PDFs zusammenführen, teilen und komprimieren.",
      component: "@tracht-digital-solutions/tds-tool-media/tools/PdfTools.astro",
      premiumDefault: true,
      priceCentsDefault: 500,
    }),
  ],
});
```

`component` is a **package subpath** (resolved via the package's `exports`),
never a local relative path.

## Composing in the site (`tds-tools-frontend`)

```js
// astro.config.mjs
import { toolHost } from "@tracht-digital-solutions/tds-tools-contract/astro";
import qr from "@tracht-digital-solutions/tds-tool-qr";
import media from "@tracht-digital-solutions/tds-tool-media";

export default defineConfig({
  integrations: [react(), toolHost({ packs: [qr, media] })],
});
```

`toolHost` composes the packs (failing the build on an id/slug collision or a
missing dependency) and serves two virtual modules the site imports:

- `virtual:tools-catalog` — the flattened `ComposedCatalog` (catalog index +
  `getStaticPaths`).
- `virtual:tools-components` — an `id → Component` map (the `/tools/[slug]`
  template renders the right tool).

## API

- `defineTool(tool)` / `defineToolPack(manifest)` — identity + eager validation.
- `validateTool` / `validateToolPack` — return problems without throwing.
- `composeToolPacks(packs)` — flatten + topo-sort; throws on collisions/cycles.
- `toolHost({ packs })` (from `./astro`) — the Astro integration.

## Invariants

- Tool `id` **and** `slug` are globally unique across all composed packs — a
  collision is a hard build error (the frontend twin of the Phinx unique rule).
- Depend on the **published** contract (`^1.0.0` from GitHub Packages) — stable
  at 1.x, additive minors.
- CI uses `npm install --no-package-lock`, never `npm ci` + a committed lockfile.

## Develop

```bash
npm install
npm run build        # tsup → dual ESM+CJS + d.ts
npm run type-check   # tsc --noEmit
npm run test:run     # vitest (one-shot)
```
