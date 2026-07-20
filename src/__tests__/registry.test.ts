import { describe, expect, it } from "vitest";
import {
  composeToolPacks,
  defineTool,
  defineToolPack,
  validateTool,
} from "../registry.js";
import type { ToolDef, ToolPackManifest } from "../types.js";

const tool = (over: Partial<ToolDef> & Pick<ToolDef, "id" | "slug">): ToolDef => ({
  name: "Tool",
  category: "developer",
  description: "Ein Tool",
  component: "@tracht-digital-solutions/tds-tool-x/tools/X.astro",
  ...over,
});

const pack = (over: Partial<ToolPackManifest> & Pick<ToolPackManifest, "id" | "tools">): ToolPackManifest => ({
  name: "Pack",
  version: "0.1.0",
  ...over,
});

describe("defineTool / validateTool", () => {
  it("accepts a valid tool", () => {
    expect(() => defineTool(tool({ id: "qr-code", slug: "qr-code" }))).not.toThrow();
  });

  it("rejects a non-kebab id", () => {
    expect(validateTool(tool({ id: "QR_Code", slug: "qr" }))).toContainEqual(
      expect.stringContaining("id must be kebab-case"),
    );
  });

  it("rejects a non-kebab slug", () => {
    expect(validateTool(tool({ id: "qr", slug: "QR Code" }))).toContainEqual(
      expect.stringContaining("slug must be kebab-case"),
    );
  });

  it("rejects a negative price", () => {
    expect(validateTool(tool({ id: "qr", slug: "qr", priceCentsDefault: -1 }))).toContainEqual(
      expect.stringContaining("priceCentsDefault"),
    );
  });

  it("throws from defineTool on an invalid tool", () => {
    expect(() => defineTool(tool({ id: "", slug: "" }))).toThrow(/Invalid tool/);
  });
});

describe("defineToolPack", () => {
  it("requires at least one tool", () => {
    expect(() => defineToolPack(pack({ id: "empty", tools: [] }))).toThrow(/at least one tool/);
  });

  it("rejects duplicate tool ids within a pack", () => {
    expect(() =>
      defineToolPack(
        pack({ id: "dup", tools: [tool({ id: "a", slug: "a" }), tool({ id: "a", slug: "b" })] }),
      ),
    ).toThrow(/duplicate tool id/);
  });
});

describe("composeToolPacks", () => {
  it("flattens and sorts tools by category then name", () => {
    const catalog = composeToolPacks([
      pack({
        id: "p1",
        tools: [
          tool({ id: "zebra", slug: "zebra", category: "media", name: "Zebra" }),
          tool({ id: "apple", slug: "apple", category: "developer", name: "Apple" }),
        ],
      }),
    ]);
    expect(catalog.tools.map((t) => t.id)).toEqual(["apple", "zebra"]);
  });

  it("throws on a duplicate pack id", () => {
    expect(() =>
      composeToolPacks([
        pack({ id: "same", tools: [tool({ id: "a", slug: "a" })] }),
        pack({ id: "same", tools: [tool({ id: "b", slug: "b" })] }),
      ]),
    ).toThrow(/Duplicate tool pack id/);
  });

  it("throws on a tool id collision across packs", () => {
    expect(() =>
      composeToolPacks([
        pack({ id: "p1", tools: [tool({ id: "shared", slug: "s1" })] }),
        pack({ id: "p2", tools: [tool({ id: "shared", slug: "s2" })] }),
      ]),
    ).toThrow(/Conflicting tool id "shared"/);
  });

  it("throws on a slug collision across packs", () => {
    expect(() =>
      composeToolPacks([
        pack({ id: "p1", tools: [tool({ id: "a", slug: "dup" })] }),
        pack({ id: "p2", tools: [tool({ id: "b", slug: "dup" })] }),
      ]),
    ).toThrow(/Conflicting tool slug "dup"/);
  });

  it("resolves dependency order (dependency before dependent)", () => {
    const catalog = composeToolPacks([
      pack({ id: "child", dependsOn: ["base"], tools: [tool({ id: "c", slug: "c" })] }),
      pack({ id: "base", tools: [tool({ id: "b", slug: "b" })] }),
    ]);
    expect(catalog.order).toEqual(["base", "child"]);
  });

  it("throws on a missing dependency", () => {
    expect(() =>
      composeToolPacks([pack({ id: "child", dependsOn: ["ghost"], tools: [tool({ id: "c", slug: "c" })] })]),
    ).toThrow(/depends on "ghost"/);
  });

  it("throws on a dependency cycle", () => {
    expect(() =>
      composeToolPacks([
        pack({ id: "a", dependsOn: ["b"], tools: [tool({ id: "a", slug: "a" })] }),
        pack({ id: "b", dependsOn: ["a"], tools: [tool({ id: "b", slug: "b" })] }),
      ]),
    ).toThrow(/Dependency cycle/);
  });

  it("merges i18n with later packs winning", () => {
    const catalog = composeToolPacks([
      pack({ id: "base", tools: [tool({ id: "a", slug: "a" })], i18n: { de: { k: "base" }, en: {} } }),
      pack({
        id: "child",
        dependsOn: ["base"],
        tools: [tool({ id: "b", slug: "b" })],
        i18n: { de: { k: "child" }, en: {} },
      }),
    ]);
    expect(catalog.i18n.de.k).toBe("child");
  });
});
