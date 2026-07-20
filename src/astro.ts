/**
 * Astro-side glue for the tools-platform contract.
 *
 * The public site (`tds-tools`) spreads `toolHost({ packs: [...] })` into its
 * Astro `integrations`. At build time it:
 *   1. composes the pack manifests ({@link composeToolPacks}) — failing the
 *      build loudly on a conflict / missing-dep,
 *   2. exposes two virtual modules the site imports:
 *        - `virtual:tools-catalog`     — the flattened {@link ComposedCatalog}
 *          as data (used by the catalog index page + `getStaticPaths`).
 *        - `virtual:tools-components`   — a generated module that statically
 *          imports each tool's `component` and exports an id → Component map,
 *          so the site's `/tools/[slug]` template can render + hydrate the right
 *          tool in a loop (Astro can't hydrate a component named only by a
 *          runtime string, so we generate real `import` statements Vite resolves).
 *
 * Routing lives in the SITE (a single `src/pages/tools/[slug].astro` template
 * driven by `getStaticPaths()` over the catalog), NOT here — the template needs
 * the site's Layout/SEO/ad-slots/premium-gate chrome, which belongs to the site,
 * not the contract. So this integration only registers the Vite plugin.
 *
 * Composition happens at build time — no runtime plugin loading, no
 * `output: "server"`, one static `dist/`.
 *
 * NB: we model Astro's integration shape structurally ({@link
 * AstroIntegrationLike}) instead of importing `astro`, so `tools-contract` stays
 * dependency-free and builds in isolation; the object is assignment-compatible
 * with the real `AstroIntegration`.
 */

import { composeToolPacks } from "./registry.js";
import type { ComposedCatalog, ToolPackManifest } from "./types.js";

const MODULES = {
  catalog: "virtual:tools-catalog",
  components: "virtual:tools-components",
} as const;

/** Minimal structural mirror of `astro`'s `AstroIntegration` (build hooks we use). */
export interface AstroIntegrationLike {
  name: string;
  hooks: {
    "astro:config:setup"?: (options: {
      updateConfig: (config: Record<string, unknown>) => void;
      logger: { info: (msg: string) => void; warn: (msg: string) => void };
    }) => void | Promise<void>;
  };
}

export interface ToolHostOptions {
  /** The enabled tool packages for this site build (imported pack manifests). */
  packs: ToolPackManifest[];
}

/**
 * Build the site integration. Composition happens once, up front, so a
 * conflicting or unsatisfied pack set fails the build immediately with a clear
 * message rather than producing a half-wired catalog.
 */
export function toolHost(options: ToolHostOptions): AstroIntegrationLike {
  const catalog: ComposedCatalog = composeToolPacks(options.packs);

  return {
    name: "tools-host",
    hooks: {
      "astro:config:setup": ({ updateConfig, logger }) => {
        updateConfig({ vite: { plugins: [toolsCatalogVitePlugin(catalog)] } });
        logger.info(
          `tools-host: ${catalog.order.length} pack(s) [${catalog.order.join(", ")}], ` +
            `${catalog.tools.length} tool(s)`,
        );
      },
    },
  };
}

/** Minimal structural mirror of a Vite plugin (the two hooks we use). */
interface VitePluginLike {
  name: string;
  resolveId(id: string): string | undefined;
  load(id: string): string | undefined;
}

/** Serves the two virtual modules the site imports. */
function toolsCatalogVitePlugin(catalog: ComposedCatalog): VitePluginLike {
  const resolved = new Map<string, string>(
    Object.values(MODULES).map((id) => [id, "\0" + id]),
  );

  return {
    name: "tools-catalog",
    resolveId(id) {
      return resolved.get(id);
    },
    load(id) {
      if (id === resolved.get(MODULES.catalog)) {
        return `export const catalog = ${JSON.stringify(catalog)};\n`;
      }
      if (id === resolved.get(MODULES.components)) {
        return generateComponentsModule(catalog);
      }
      return undefined;
    },
  };
}

/**
 * Generate a module that statically imports each tool's `component` and exports
 * an `id → Component` map. Real `import` statements are what let Astro render +
 * hydrate the components (looked up by the `[slug]` template).
 */
function generateComponentsModule(catalog: ComposedCatalog): string {
  const imports: string[] = [];
  const entries: string[] = [];
  catalog.tools.forEach((tool, index) => {
    const local = `__C${index}`;
    imports.push(`import ${local} from ${JSON.stringify(tool.component)};`);
    entries.push(`  ${JSON.stringify(tool.id)}: ${local}`);
  });
  return (
    imports.join("\n") +
    `\nexport const components = {\n${entries.join(",\n")}\n};\n`
  );
}
