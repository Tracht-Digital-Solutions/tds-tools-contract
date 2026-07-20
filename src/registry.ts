/**
 * Composition helpers for the tools-platform contract.
 *
 * These run at BUILD time in the site (`tds-tools`): the site's config imports
 * each package's {@link ToolPackManifest}, and {@link composeToolPacks} resolves
 * dependency order, catches conflicts, and flattens the tools into one
 * {@link ComposedCatalog} the catalog page + Astro integration consume. Pure +
 * dependency-free so it is trivially unit tested (see `__tests__/registry.test.ts`).
 */

import type {
  ComposedCatalog,
  I18nStrings,
  ToolDef,
  ToolPackManifest,
} from "./types.js";

const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * Identity helper for a single tool, e.g. inside a pack's `tools: [defineTool({
 * id: "qr-code", ... })]`. Validates eagerly so a malformed tool fails at the
 * package's own build/test, not deep inside a site build. Throws on the first
 * batch of errors.
 */
export function defineTool(tool: ToolDef): ToolDef {
  const errors = validateTool(tool);
  if (errors.length > 0) {
    throw new Error(
      `Invalid tool "${tool.id ?? "<no id>"}":\n  - ${errors.join("\n  - ")}`,
    );
  }
  return tool;
}

/**
 * Identity helper a package's entry uses to export its manifest, e.g.
 * `export default defineToolPack({ id: "media", tools: [...] })`.
 */
export function defineToolPack(manifest: ToolPackManifest): ToolPackManifest {
  const errors = validateToolPack(manifest);
  if (errors.length > 0) {
    throw new Error(
      `Invalid tool pack "${manifest.id ?? "<no id>"}":\n  - ${errors.join("\n  - ")}`,
    );
  }
  return manifest;
}

/** Structural validation of one {@link ToolDef}. Returns human-readable problems. */
export function validateTool(tool: ToolDef): string[] {
  const errors: string[] = [];
  if (!tool.id || !KEBAB.test(tool.id)) {
    errors.push(`id must be kebab-case (got ${JSON.stringify(tool.id)})`);
  }
  if (!tool.slug || !KEBAB.test(tool.slug)) {
    errors.push(`slug must be kebab-case (got ${JSON.stringify(tool.slug)})`);
  }
  if (!tool.name) errors.push("name is required");
  if (!tool.description) errors.push("description is required");
  if (!tool.category) errors.push("category is required");
  if (!tool.component) errors.push("component (import specifier) is required");
  if (tool.priceCentsDefault !== undefined && (!Number.isInteger(tool.priceCentsDefault) || tool.priceCentsDefault < 0)) {
    errors.push(`priceCentsDefault must be a non-negative integer (got ${JSON.stringify(tool.priceCentsDefault)})`);
  }
  return errors;
}

/** Structural validation of a whole {@link ToolPackManifest}. */
export function validateToolPack(manifest: ToolPackManifest): string[] {
  const errors: string[] = [];
  if (!manifest.id || !KEBAB.test(manifest.id)) {
    errors.push(`id must be kebab-case (got ${JSON.stringify(manifest.id)})`);
  }
  if (!manifest.name) errors.push("name is required");
  if (!manifest.version) errors.push("version is required");
  if (!Array.isArray(manifest.tools) || manifest.tools.length === 0) {
    errors.push("tools must contain at least one tool");
  }

  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();
  for (const tool of manifest.tools ?? []) {
    for (const e of validateTool(tool)) errors.push(`tool "${tool.id ?? "?"}": ${e}`);
    if (seenIds.has(tool.id)) errors.push(`duplicate tool id "${tool.id}" within pack`);
    seenIds.add(tool.id);
    if (seenSlugs.has(tool.slug)) errors.push(`duplicate tool slug "${tool.slug}" within pack`);
    seenSlugs.add(tool.slug);
  }
  return errors;
}

/**
 * Compose a set of tool packs into one flattened catalog for a site build.
 *
 * - Resolves load order by `dependsOn` (topological); throws on a missing
 *   dependency or a dependency cycle.
 * - Throws on a duplicate **pack** id, or a duplicate tool `id` / `slug`
 *   **across** packs — the site's one-build model has no namespacing, so
 *   collisions are hard errors (the frontend twin of the Phinx unique rule).
 * - Merges i18n; on a key collision the later (dependency-wise) pack wins.
 * - Sorts tools by category, then name, for a deterministic catalog.
 *
 * @param packs the enabled tool packages, in any order.
 */
export function composeToolPacks(packs: ToolPackManifest[]): ComposedCatalog {
  const byId = new Map<string, ToolPackManifest>();
  for (const p of packs) {
    if (byId.has(p.id)) throw new Error(`Duplicate tool pack id "${p.id}"`);
    byId.set(p.id, p);
  }

  const order = topoSort(packs, byId);
  const ordered = order.map((id) => byId.get(id)!);

  const tools: ToolDef[] = [];
  const i18n: I18nStrings = { de: {}, en: {} };
  const toolIds = new Set<string>();
  const toolSlugs = new Set<string>();

  for (const pack of ordered) {
    for (const tool of pack.tools) {
      if (toolIds.has(tool.id)) {
        throw new Error(`Conflicting tool id "${tool.id}" (from pack "${pack.id}")`);
      }
      if (toolSlugs.has(tool.slug)) {
        throw new Error(`Conflicting tool slug "${tool.slug}" (from pack "${pack.id}")`);
      }
      toolIds.add(tool.id);
      toolSlugs.add(tool.slug);
      tools.push(tool);
    }
    if (pack.i18n) {
      Object.assign(i18n.de, pack.i18n.de);
      Object.assign(i18n.en, pack.i18n.en);
    }
  }

  const sorted = stableSort(tools, (a, b) =>
    a.category === b.category ? a.name.localeCompare(b.name, "de") : a.category.localeCompare(b.category),
  );

  return { order, tools: sorted, i18n };
}

/** Kahn-style topological sort by `dependsOn`; throws on missing dep / cycle. */
function topoSort(
  packs: ToolPackManifest[],
  byId: Map<string, ToolPackManifest>,
): string[] {
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const p of packs) {
    indegree.set(p.id, indegree.get(p.id) ?? 0);
    for (const dep of p.dependsOn ?? []) {
      if (!byId.has(dep)) {
        throw new Error(`Tool pack "${p.id}" depends on "${dep}", which is not enabled`);
      }
      indegree.set(p.id, (indegree.get(p.id) ?? 0) + 1);
      dependents.set(dep, [...(dependents.get(dep) ?? []), p.id]);
    }
  }

  // Seed with dependency-free packs in declaration order for determinism.
  const queue = packs.filter((p) => (indegree.get(p.id) ?? 0) === 0).map((p) => p.id);
  const result: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    result.push(id);
    for (const dependent of dependents.get(id) ?? []) {
      const next = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, next);
      if (next === 0) queue.push(dependent);
    }
  }

  if (result.length !== packs.length) {
    const cyclic = packs.map((p) => p.id).filter((id) => !result.includes(id));
    throw new Error(`Dependency cycle among tool packs: ${cyclic.join(", ")}`);
  }
  return result;
}

/** Stable sort (Array.prototype.sort is spec-stable, but be explicit + typed). */
function stableSort<T>(items: T[], cmp: (a: T, b: T) => number): T[] {
  return items
    .map((value, index) => ({ value, index }))
    .sort((a, b) => cmp(a.value, b.value) || a.index - b.index)
    .map((entry) => entry.value);
}
