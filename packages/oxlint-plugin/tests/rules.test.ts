import { describe, expect, it } from "vitest";
import plugin from "../index.js";

type Report = { messageId: string; node?: unknown };

function runRule(
  ruleName: keyof typeof plugin.rules,
  visit: (handlers: Record<string, (node: unknown) => void>) => void,
): Report[] {
  const rule = plugin.rules[ruleName];
  const reports: Report[] = [];
  const context = {
    report(entry: Report) {
      reports.push(entry);
    },
  };
  // Oxlint rules use createOnce; fall back to create for ESLint-shaped rules.
  const create =
    "createOnce" in rule && typeof rule.createOnce === "function"
      ? rule.createOnce.bind(rule)
      : "create" in rule && typeof rule.create === "function"
        ? rule.create.bind(rule)
        : null;
  if (!create) {
    throw new Error(`Rule ${String(ruleName)} has no create/createOnce`);
  }
  const handlers = create(context as never) as Record<
    string,
    (node: unknown) => void
  >;
  visit(handlers);
  return reports;
}

describe("@zwents/oxlint-plugin", () => {
  it("exports the three zwents rules", () => {
    expect(plugin.meta.name).toBe("zwents");
    expect(Object.keys(plugin.rules).toSorted()).toEqual([
      "no-decorators",
      "no-reflect-metadata",
      "require-route-output",
    ]);
  });

  describe("no-reflect-metadata", () => {
    it("reports import of reflect-metadata", () => {
      const reports = runRule("no-reflect-metadata", (h) => {
        h["ImportDeclaration"]?.({
          source: { value: "reflect-metadata" },
        });
      });
      expect(reports).toEqual([
        { messageId: "forbidden", node: expect.anything() },
      ]);
    });

    it("does not report other imports", () => {
      const reports = runRule("no-reflect-metadata", (h) => {
        h["ImportDeclaration"]?.({ source: { value: "zod" } });
      });
      expect(reports).toEqual([]);
    });

    it("reports require('reflect-metadata')", () => {
      const reports = runRule("no-reflect-metadata", (h) => {
        h["CallExpression"]?.({
          callee: { type: "Identifier", name: "require" },
          arguments: [{ type: "Literal", value: "reflect-metadata" }],
        });
      });
      expect(reports).toHaveLength(1);
      expect(reports[0]?.messageId).toBe("forbidden");
    });

    it("does not report other require calls", () => {
      const reports = runRule("no-reflect-metadata", (h) => {
        h["CallExpression"]?.({
          callee: { type: "Identifier", name: "require" },
          arguments: [{ type: "Literal", value: "fs" }],
        });
        h["CallExpression"]?.({
          callee: { type: "MemberExpression" },
          arguments: [{ type: "Literal", value: "reflect-metadata" }],
        });
        h["CallExpression"]?.({
          callee: { type: "Identifier", name: "require" },
          arguments: [],
        });
      });
      expect(reports).toEqual([]);
    });
  });

  describe("no-decorators", () => {
    it("reports Decorator nodes", () => {
      const node = { type: "Decorator" };
      const reports = runRule("no-decorators", (h) => {
        h["Decorator"]?.(node);
      });
      expect(reports).toEqual([{ messageId: "forbidden", node }]);
    });
  });

  describe("require-route-output", () => {
    it("reports route({...}) without output", () => {
      const arg = { type: "ObjectExpression", properties: [] };
      const reports = runRule("require-route-output", (h) => {
        h["CallExpression"]?.({
          callee: { type: "Identifier", name: "route" },
          arguments: [arg],
        });
      });
      expect(reports).toEqual([{ messageId: "missing", node: arg }]);
    });

    it("allows route({ output }) via Identifier key", () => {
      const reports = runRule("require-route-output", (h) => {
        h["CallExpression"]?.({
          callee: { type: "Identifier", name: "route" },
          arguments: [
            {
              type: "ObjectExpression",
              properties: [
                {
                  type: "Property",
                  key: { type: "Identifier", name: "output" },
                },
              ],
            },
          ],
        });
      });
      expect(reports).toEqual([]);
    });

    it("allows route({ 'output': ... }) via Literal key", () => {
      const reports = runRule("require-route-output", (h) => {
        h["CallExpression"]?.({
          callee: { type: "Identifier", name: "route" },
          arguments: [
            {
              type: "ObjectExpression",
              properties: [
                {
                  type: "Property",
                  key: { type: "Literal", value: "output" },
                },
              ],
            },
          ],
        });
      });
      expect(reports).toEqual([]);
    });

    it("ignores app.route and non-object first args", () => {
      const reports = runRule("require-route-output", (h) => {
        h["CallExpression"]?.({
          callee: { type: "MemberExpression" },
          arguments: [{ type: "ObjectExpression", properties: [] }],
        });
        h["CallExpression"]?.({
          callee: { type: "Identifier", name: "route" },
          arguments: [],
        });
        h["CallExpression"]?.({
          callee: { type: "Identifier", name: "route" },
          arguments: [{ type: "Identifier", name: "opts" }],
        });
        h["CallExpression"]?.({
          callee: { type: "Identifier", name: "createApp" },
          arguments: [{ type: "ObjectExpression", properties: [] }],
        });
      });
      expect(reports).toEqual([]);
    });
  });
});
