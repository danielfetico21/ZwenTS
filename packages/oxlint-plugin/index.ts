import { definePlugin, defineRule } from "@oxlint/plugins";

const noReflectMetadata = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow importing reflect-metadata (decorator DI is out of scope)",
    },
    schema: [],
    messages: {
      forbidden:
        "Do not import 'reflect-metadata'. ZwenTS uses explicit composition, not decorator DI.",
    },
  },
  createOnce(context) {
    return {
      ImportDeclaration(node) {
        if (node.source.value === "reflect-metadata") {
          context.report({ node, messageId: "forbidden" });
        }
      },
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "require" &&
          node.arguments[0]?.type === "Literal" &&
          node.arguments[0].value === "reflect-metadata"
        ) {
          context.report({ node, messageId: "forbidden" });
        }
      },
    };
  },
});

const noDecorators = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow TypeScript/JavaScript decorators",
    },
    schema: [],
    messages: {
      forbidden:
        "Decorators are banned in ZwenTS apps. Prefer plain functions and explicit composition.",
    },
  },
  createOnce(context) {
    return {
      Decorator(node) {
        context.report({ node, messageId: "forbidden" });
      },
    };
  },
});

/**
 * Heuristic: `route({ ... })` objects used as public API should declare `output`
 * so OpenAPI and response contracts stay honest.
 */
const requireRouteOutput = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description: "Require `output` in `route({ ... })` options objects",
    },
    schema: [],
    messages: {
      missing:
        "route() options should include an `output` schema for OpenAPI and response validation.",
    },
  },
  createOnce(context) {
    return {
      CallExpression(node) {
        // Only the `@zwents/schema` helper: `route({ ... })`, not `app.route(...)`.
        if (node.callee.type !== "Identifier" || node.callee.name !== "route") {
          return;
        }

        const arg = node.arguments[0];
        if (!arg || arg.type !== "ObjectExpression") return;

        const hasOutput = arg.properties.some(
          (prop) =>
            prop.type === "Property" &&
            ((prop.key.type === "Identifier" && prop.key.name === "output") ||
              (prop.key.type === "Literal" && prop.key.value === "output")),
        );

        if (!hasOutput) {
          context.report({ node: arg, messageId: "missing" });
        }
      },
    };
  },
});

export default definePlugin({
  meta: {
    name: "zwents",
  },
  rules: {
    "no-reflect-metadata": noReflectMetadata,
    "no-decorators": noDecorators,
    "require-route-output": requireRouteOutput,
  },
});
