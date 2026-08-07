import type { App, Middleware, RouteDefinition } from "@zwents/core";
import { ComponentSchemaRegistry } from "./components.js";
import {
  buildOperation,
  collectSecurity,
  methodKey,
  openApiPath,
} from "./operations.js";

export type OpenApiInfo = {
  title: string;
  version: string;
  description?: string;
};

export type GenerateOpenApiOptions = {
  info: OpenApiInfo;
  servers?: Array<{ url: string; description?: string }>;
  /**
   * Extra / override security schemes merged into `components.securitySchemes`.
   * Schemes discovered from `@zwents/auth` middleware are included automatically.
   */
  securitySchemes?: Record<string, Record<string, unknown>>;
  /** Global OpenAPI `security` requirements (optional). */
  security?: readonly Record<string, string[]>[];
  /**
   * When `true` (default), body / output / error schemas are registered under
   * `components.schemas` and referenced via `$ref`. Set `false` to inline.
   */
  schemaRefs?: boolean;
};

/**
 * Generate an OpenAPI 3.1 document from routes registered on an app.
 * Routes created with `@zwents/schema` `route()` expose Zod schemas via `meta`.
 * Security schemes are discovered from `@zwents/auth` middleware metadata.
 * Body / output / error schemas are registered under `components.schemas` by default.
 */
export function generateOpenApi<S>(
  app: App<S>,
  options: GenerateOpenApiOptions,
): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  const appSecurity = collectSecurity([app.middleware as readonly Middleware[]]);
  const securitySchemes: Record<string, Record<string, unknown>> = {
    ...appSecurity.schemes,
  };
  const useRefs = options.schemaRefs !== false;
  const components = useRefs ? new ComponentSchemaRegistry() : null;

  for (const route of app.routes) {
    const routeSchemes = collectSecurity([
      route.middleware as readonly Middleware[] | undefined,
    ]).schemes;
    Object.assign(securitySchemes, routeSchemes);

    const path = openApiPath(route.path);
    const pathItem = paths[path] ?? {};
    pathItem[methodKey(route.method)] = buildOperation(
      route as RouteDefinition<unknown>,
      appSecurity.require,
      components,
    );
    paths[path] = pathItem;
  }

  if (options.securitySchemes) {
    Object.assign(securitySchemes, options.securitySchemes);
  }

  const document: Record<string, unknown> = {
    openapi: "3.1.0",
    info: options.info,
    servers: options.servers,
    paths,
  };

  const schemas = components?.build() ?? {};
  const componentsOut: Record<string, unknown> = {};
  if (Object.keys(schemas).length > 0) {
    componentsOut["schemas"] = schemas;
  }
  if (Object.keys(securitySchemes).length > 0) {
    componentsOut["securitySchemes"] = securitySchemes;
  }
  if (Object.keys(componentsOut).length > 0) {
    document["components"] = componentsOut;
  }

  if (options.security?.length) {
    document["security"] = [...options.security];
  }

  return document;
}

export function stringifyOpenApi(
  document: Record<string, unknown>,
  space = 2,
): string {
  return `${JSON.stringify(document, null, space)}\n`;
}
