/**
 * `@tracht-digital-solutions/tds-tools-contract` — the SDK the public tools site
 * and every tool package build against. Pure types + build-time composition
 * helpers; the Astro host glue lives in the `./astro` subexport.
 *
 * Frontend-only by design: the admin-controlled catalog (enabled / requires-login
 * / premium / price) and the entitlement + Stripe logic live in the
 * `tds-ext-tools` panel extension, not here. A tool package declares only the
 * defaults via {@link defineTool}; the catalog overrides them at runtime.
 */

export type {
  ComposedCatalog,
  I18nStrings,
  ToolCategory,
  ToolDef,
  ToolPackManifest,
  ToolSeo,
} from "./types.js";

export {
  composeToolPacks,
  defineTool,
  defineToolPack,
  validateTool,
  validateToolPack,
} from "./registry.js";
