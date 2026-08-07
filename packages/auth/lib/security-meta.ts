/** Symbol attached to middleware for OpenAPI security discovery. */
export const SECURITY_META: unique symbol = Symbol.for("@zwents/auth.security");

export type OpenApiHttpSecurityScheme = {
  type: "http";
  scheme: string;
  bearerFormat?: string;
  description?: string;
};

export type OpenApiSecurityScheme =
  | OpenApiHttpSecurityScheme
  | {
      type: "apiKey";
      name: string;
      in: "header" | "query" | "cookie";
      description?: string;
    };

/** OpenAPI security requirement object, e.g. `{ bearerAuth: [] }`. */
export type OpenApiSecurityRequirement = Record<string, string[]>;

export type MiddlewareSecurityMeta = {
  /** Schemes to register under `components.securitySchemes`. */
  schemes?: Record<string, OpenApiSecurityScheme>;
  /**
   * When set, operations that use this middleware (or inherit app-level
   * required auth) document these requirements.
   */
  require?: readonly OpenApiSecurityRequirement[];
};

export type SecurityAwareMiddleware = {
  (ctx: unknown, next: unknown): unknown;
  [SECURITY_META]?: MiddlewareSecurityMeta;
};

export function getSecurityMeta(
  middleware: unknown,
): MiddlewareSecurityMeta | undefined {
  if (typeof middleware !== "function") return undefined;
  return (middleware as SecurityAwareMiddleware)[SECURITY_META];
}

export function withSecurityMeta<T extends (...args: never[]) => unknown>(
  middleware: T,
  meta: MiddlewareSecurityMeta,
): T {
  const tagged = middleware as T & SecurityAwareMiddleware;
  tagged[SECURITY_META] = meta;
  return tagged;
}
