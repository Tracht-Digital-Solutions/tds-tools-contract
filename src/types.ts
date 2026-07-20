/**
 * The tools-platform contract (frontend side).
 *
 * `tds-tools-contract` is the single source of truth for how the public tools
 * site (`tds-tools`) discovers and composes **tool packages** (`tds-tool-*`) at
 * BUILD time. There is no runtime plugin loading — the site imports each
 * package's {@link ToolPackManifest} and folds it into one static build
 * (`output: "static"`, no Node on prod). It is the tools-site twin of
 * `tds-panel-contract`, but frontend-only: the admin-controlled catalog
 * (enabled / requires-login / premium / price) and the entitlement/Stripe logic
 * live in the `tds-ext-tools` panel extension, not here. A tool package declares
 * only the *defaults*; the admin catalog overrides them at runtime.
 *
 * Everything user-facing here (names, descriptions, labels) is German — it is
 * editable copy and, per the TDS convention, lives with the contract/package,
 * not inlined in a page.
 */

/**
 * Coarse grouping used to lay out the catalog. Kept small + closed so the site
 * can render a stable set of category sections; add a value here (and its label
 * in the site) when a genuinely new area appears.
 */
export type ToolCategory =
  | "content"
  | "developer"
  | "design"
  | "marketing"
  | "media"
  | "security"
  | "business"
  | "other";

/** Per-tool SEO overrides baked into the tool page's `<head>` + JSON-LD. */
export interface ToolSeo {
  /** `<title>` override; falls back to the tool name + site suffix. */
  title?: string;
  /** meta description override; falls back to {@link ToolDef.description}. */
  description?: string;
  /** schema.org type for the JSON-LD block. Default `"WebApplication"`. */
  jsonLdType?: string;
  /** Extra keywords merged into {@link ToolDef.keywords} for the meta tag. */
  keywords?: string[];
}

/**
 * One tool contributed by a package. `id` and `slug` are BOTH globally unique
 * across every composed package — the site renders one route per slug and keys
 * the component map by id, so a collision in either is a hard build error (the
 * frontend twin of the Phinx "unique migration class name" rule).
 */
export interface ToolDef {
  /** Stable, kebab-case id, globally unique, e.g. `"qr-code"`. */
  id: string;
  /** URL slug (the page mounts at `/tools/<slug>`), kebab-case, globally unique. */
  slug: string;
  /** German display name (catalog card + page heading). */
  name: string;
  /** Category the catalog groups this tool under. */
  category: ToolCategory;
  /** Short German description (catalog card + meta description default). */
  description: string;
  /** Icon key resolved by the site's icon set (e.g. `"qr-code"`). */
  icon?: string;
  /** Search keywords (catalog filter + SEO). */
  keywords?: string[];
  /**
   * Import specifier of the tool's UI component (an `.astro` shell that may
   * embed a hydrated React island, or a `.tsx` island directly). The site wraps
   * it in the shared Layout + SEO + ad slots + premium gate.
   */
  component: string;
  /** Default: does this tool require a login? The admin catalog can override. */
  requiresLoginDefault?: boolean;
  /** Default: is this a premium (paid) tool? The admin catalog can override. */
  premiumDefault?: boolean;
  /** Default price in cents when premium. The admin catalog can override. */
  priceCentsDefault?: number;
  /** Optional SEO overrides for the tool page. */
  seo?: ToolSeo;
}

/** Per-locale string tables a package contributes to the shared i18n dict. */
export interface I18nStrings {
  de: Record<string, string>;
  en: Record<string, string>;
}

/**
 * The complete contribution surface of one tool package (frontend side).
 * A package's entry exports one of these (via {@link defineToolPack}). A single
 * package may register several related tools (a "pack").
 */
export interface ToolPackManifest {
  /** Stable, kebab-case pack id, e.g. `"media"`. Unique across the site. */
  id: string;
  /** German display name for the pack (used in credits / debugging). */
  name: string;
  /** Semver of the package. */
  version: string;
  /** ids of other packs this one depends on (load-order only; topological). */
  dependsOn?: string[];
  /** The tools this package contributes. At least one. */
  tools: ToolDef[];
  /** Optional i18n contribution merged into the site dictionary. */
  i18n?: I18nStrings;
}

/**
 * The flattened result of composing a set of packs for one site build.
 * Produced by {@link composeToolPacks}, consumed by the site's catalog page +
 * the Astro integration's virtual modules. `tools` is sorted by category then
 * name for a deterministic catalog order.
 */
export interface ComposedCatalog {
  /** Pack ids in resolved dependency (load) order. */
  order: string[];
  /** Flattened tools across all packs, sorted by category then name. */
  tools: ToolDef[];
  /** Merged i18n across all packs (later ids win on key collision). */
  i18n: I18nStrings;
}
