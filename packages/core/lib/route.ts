export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

/** Uploaded file part from `multipart/form-data` (filled by `@zwents/http`). */
export type UploadedFile = {
  field: string;
  filename: string;
  contentType: string;
  size: number;
  bytes: Uint8Array;
};

/** Raw input assembled by core/adapters before schema validation. */
export type RawRouteInput = {
  params: Record<string, string>;
  query?: unknown;
  body?: unknown;
  /** Exact request bytes (JSON/raw) for webhooks / signature checks. */
  raw?: Uint8Array;
  /** Multipart file parts. */
  files?: readonly UploadedFile[];
};

/** What adapters pass into `dispatch`; path `params` come from the matcher. */
export type DispatchInput = Omit<RawRouteInput, "params">;

export type Handler<S = unknown, TInput = unknown, TOutput = unknown> = (
  ctx: import("./context.js").RequestContext<S>,
  input: TInput,
) => Promise<TOutput> | TOutput;

/** Optional metadata for OpenAPI / CLI (schemas stay opaque in core). */
export type RouteMeta = {
  tags?: readonly string[];
  schemas?: {
    params?: unknown;
    query?: unknown;
    body?: unknown;
    output?: unknown;
  };
  /** When set, handler receives decoded `raw` (`utf8` string or `bytes`). */
  rawBody?: "bytes" | "utf8";
  /**
   * OpenAPI `security` for this operation.
   * - omit → inferred from auth middleware tags
   * - `false` → no security
   * - array → explicit requirements (e.g. `[{ bearerAuth: [] }]`)
   */
  security?: false | readonly Record<string, string[]>[];
  /**
   * Declared error responses: HTTP status (as string key) → response schema.
   * Populated by `@zwents/schema` `route({ errors: { 404: Schema } })`.
   */
  errors?: Readonly<Record<string, unknown>>;
};

export type RouteDefinition<S = unknown, TInput = unknown, TOutput = unknown> = {
  method: HttpMethod;
  path: string;
  middleware?: readonly import("./middleware.js").Middleware<S>[];
  handler: Handler<S, TInput, TOutput>;
  meta?: RouteMeta;
};

export type RouteMatch = {
  route: RouteDefinition;
  params: Record<string, string>;
};

export type CompiledRoute = {
  definition: RouteDefinition;
  method: HttpMethod;
  regex: RegExp;
  paramNames: string[];
};

function escapeRegex(segment: string): string {
  return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compilePath(path: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const parts = path.split("/").map((segment) => {
    if (segment.startsWith(":")) {
      paramNames.push(segment.slice(1));
      return "([^/]+)";
    }
    return escapeRegex(segment);
  });
  return {
    regex: new RegExp(`^${parts.join("/")}$`),
    paramNames,
  };
}

export function compileRoute(definition: RouteDefinition): CompiledRoute {
  const { regex, paramNames } = compilePath(definition.path);
  return {
    definition,
    method: definition.method,
    regex,
    paramNames,
  };
}

export function matchRoute(
  routes: readonly CompiledRoute[],
  method: string,
  path: string,
): RouteMatch | null {
  for (const route of routes) {
    if (route.method !== method) continue;
    const matched = route.regex.exec(path);
    if (!matched) continue;
    const params: Record<string, string> = {};
    let decoded = true;
    for (let i = 0; i < route.paramNames.length; i += 1) {
      const name = route.paramNames[i];
      const value = matched[i + 1];
      if (name === undefined || value === undefined) continue;
      try {
        params[name] = decodeURIComponent(value);
      } catch {
        decoded = false;
        break;
      }
    }
    if (!decoded) continue;
    return { route: route.definition, params };
  }
  return null;
}
