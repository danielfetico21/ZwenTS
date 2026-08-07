import { json, type Middleware } from "@zwents/core";
import { assertSafeHeaderValue, isSafeHeaderValue } from "./header-value.js";

export type CorsOptions = {
  /**
   * Allowed origins. Use `"*"` only without credentials.
   * Prefer an explicit list for browser APIs.
   */
  origin: "*" | readonly string[] | ((origin: string) => boolean);
  /** Defaults to `GET,HEAD,PUT,PATCH,POST,DELETE`. */
  allowMethods?: readonly string[];
  /** Defaults to `Content-Type, Authorization`. */
  allowHeaders?: readonly string[];
  /** When true, sets `Access-Control-Allow-Credentials: true`. */
  credentials?: boolean;
  /** Exposed response headers. */
  exposeHeaders?: readonly string[];
  /** Preflight cache seconds. Defaults to `600`. */
  maxAge?: number;
};

function resolveOrigin(
  requestOrigin: string | null,
  origin: CorsOptions["origin"],
): string | null {
  if (origin === "*") return "*";
  if (!requestOrigin) return null;
  // Never reflect a hostile Origin into response headers.
  if (!isSafeHeaderValue(requestOrigin)) return null;
  if (typeof origin === "function") {
    return origin(requestOrigin) ? requestOrigin : null;
  }
  return origin.includes(requestOrigin) ? requestOrigin : null;
}

function appendVary(existing: string | undefined, value: string): string {
  if (!existing) return value;
  const parts = existing.split(",").map((p) => p.trim().toLowerCase());
  if (parts.includes(value.toLowerCase())) return existing;
  return `${existing}, ${value}`;
}

/**
 * CORS middleware. Handles `OPTIONS` preflight without requiring a route.
 * Throws at construction if `credentials` is combined with `origin: "*"`.
 */
export function cors(options: CorsOptions): Middleware {
  if (options.credentials && options.origin === "*") {
    throw new Error(
      '@zwents/security cors: credentials cannot be used with origin "*"',
    );
  }

  const allowMethods = assertSafeHeaderValue(
    (
      options.allowMethods ?? [
        "GET",
        "HEAD",
        "PUT",
        "PATCH",
        "POST",
        "DELETE",
      ]
    ).join(", "),
    "allowMethods",
  );
  const allowHeaders = assertSafeHeaderValue(
    (options.allowHeaders ?? ["Content-Type", "Authorization"]).join(", "),
    "allowHeaders",
  );
  const maxAge = options.maxAge ?? 600;
  const exposeHeaders = options.exposeHeaders
    ? assertSafeHeaderValue(options.exposeHeaders.join(", "), "exposeHeaders")
    : undefined;

  if (Array.isArray(options.origin)) {
    for (const entry of options.origin) {
      assertSafeHeaderValue(entry, "origin allowlist entry");
    }
  }

  return async (ctx, next) => {
    const requestOrigin = ctx.req.headers.get("origin");
    const allowed = resolveOrigin(requestOrigin, options.origin);

    if (allowed) {
      ctx.responseHeaders["access-control-allow-origin"] = allowed;
      if (allowed !== "*") {
        ctx.responseHeaders["vary"] = appendVary(
          ctx.responseHeaders["vary"],
          "Origin",
        );
      }
      if (options.credentials) {
        ctx.responseHeaders["access-control-allow-credentials"] = "true";
      }
      if (exposeHeaders) {
        ctx.responseHeaders["access-control-expose-headers"] = exposeHeaders;
      }
    }

    if (ctx.req.method === "OPTIONS") {
      if (allowed) {
        ctx.responseHeaders["access-control-allow-methods"] = allowMethods;
        ctx.responseHeaders["access-control-allow-headers"] = allowHeaders;
        ctx.responseHeaders["access-control-max-age"] = String(maxAge);
      }
      ctx.respond(json(null, 204));
      return;
    }

    await next();
  };
}
