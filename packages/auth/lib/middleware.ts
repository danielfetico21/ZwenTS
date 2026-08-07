import {
  ErrorCodes,
  problemResponse,
  type AuthPrincipal,
  type Middleware,
  type RequestContext,
} from "@zwents/core";
import { withSecurityMeta } from "./security-meta.js";

export type VerifyBearer = (
  token: string,
  ctx: RequestContext,
) => Promise<AuthPrincipal | null> | AuthPrincipal | null;

export type BearerAuthOptions = {
  /** Header name. Defaults to `authorization`. */
  header?: string;
  /** Scheme prefix. Defaults to `Bearer`. */
  scheme?: string;
  /**
   * OpenAPI `bearerFormat` hint (e.g. `JWT`). Defaults to `JWT`.
   * Set `false` to omit.
   */
  bearerFormat?: string | false;
  /** OpenAPI components key. Defaults to `bearerAuth`. */
  securityName?: string;
  verify: VerifyBearer;
  /** When true (default), missing credentials → 401. */
  required?: boolean;
  /**
   * When a bearer token is present but `verify` returns null:
   * - `"reject"` (default) → 401
   * - `"ignore"` → continue as anonymous (only when `required: false`)
   */
  invalidToken?: "reject" | "ignore";
};

function extractBearer(
  headerValue: string | null,
  scheme: string,
): string | null {
  if (!headerValue) return null;
  const match = /^(\S+)\s+(.+)$/.exec(headerValue.trim());
  if (!match?.[1] || !match[2]) return null;
  if (match[1].toLowerCase() !== scheme.toLowerCase()) return null;
  const token = match[2].trim();
  return token.length > 0 ? token : null;
}

/**
 * Authenticate via `Authorization: Bearer <token>`.
 * On success, sets `ctx.auth`. Does not implement JWT crypto — pass `verify`.
 *
 * Tagged for OpenAPI: registers `components.securitySchemes` and, when
 * `required: true`, marks operations as secured.
 */
export function bearerAuth(options: BearerAuthOptions): Middleware {
  const headerName = (options.header ?? "authorization").toLowerCase();
  const scheme = options.scheme ?? "Bearer";
  const required = options.required ?? true;
  const invalidToken = options.invalidToken ?? "reject";
  const securityName = options.securityName ?? "bearerAuth";
  const bearerFormat =
    options.bearerFormat === false
      ? undefined
      : (options.bearerFormat ?? "JWT");

  const middleware: Middleware = async (ctx, next) => {
    const raw = ctx.req.headers.get(headerName);
    const token = extractBearer(raw, scheme);

    if (!token) {
      if (required) {
        ctx.respond(
          problemResponse(ErrorCodes.UNAUTHORIZED, ctx.req.path, {
            detail: "Missing or invalid Authorization bearer token",
          }),
        );
        return;
      }
      await next();
      return;
    }

    const principal = await options.verify(token, ctx);
    if (!principal) {
      if (required || invalidToken === "reject") {
        ctx.respond(
          problemResponse(ErrorCodes.UNAUTHORIZED, ctx.req.path, {
            detail: "Invalid credentials",
          }),
        );
        return;
      }
      await next();
      return;
    }

    ctx.auth = principal;
    await next();
  };

  return withSecurityMeta(middleware, {
    schemes: {
      [securityName]: {
        type: "http",
        scheme: "bearer",
        ...(bearerFormat ? { bearerFormat } : {}),
      },
    },
    require: required ? [{ [securityName]: [] }] : undefined,
  });
}

export type Policy<S = unknown> = (
  ctx: RequestContext<S>,
) => boolean | Promise<boolean>;

/**
 * Require an authenticated principal (non-null `ctx.auth`).
 * Documents OpenAPI security requirement (pair with `bearerAuth()`).
 */
export function requireAuth(
  options: { securityName?: string } = {},
): Middleware {
  return authorize(() => true, options);
}

/**
 * Authorize with a policy function, or require all listed roles.
 */
export function authorize<S = unknown>(
  policyOrRoles: Policy<S> | readonly string[],
  options: { securityName?: string } = {},
): Middleware<S> {
  const securityName = options.securityName ?? "bearerAuth";
  const policy: Policy<S> =
    typeof policyOrRoles === "function"
      ? policyOrRoles
      : (ctx) =>
          policyOrRoles.every((role) => ctx.auth!.roles.includes(role));

  return withSecurityMeta(
    async (ctx, next) => {
      if (!ctx.auth) {
        ctx.respond(
          problemResponse(ErrorCodes.UNAUTHORIZED, ctx.req.path, {
            detail: "Authentication required",
          }),
        );
        return;
      }

      const allowed = await policy(ctx);
      if (!allowed) {
        ctx.respond(
          problemResponse(ErrorCodes.FORBIDDEN, ctx.req.path, {
            detail: "Insufficient permissions",
          }),
        );
        return;
      }

      await next();
    },
    {
      require: [{ [securityName]: [] }],
    },
  );
}
