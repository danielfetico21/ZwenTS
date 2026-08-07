import {
  ErrorCodes,
  getDispatchInput,
  problemResponse,
  type AppResponse,
  type Middleware,
  type RequestContext,
} from "@zwents/core";
import { isSafeToken } from "@zwents/security";
import {
  memoryIdempotencyStore,
  type IdempotencyStore,
} from "./store.js";

const DEFAULT_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const MAX_KEY_LENGTH = 256;

export type IdempotencyOptions<S = unknown> = {
  /** Defaults to an in-memory store (single process). */
  store?: IdempotencyStore;
  /** How long to retain completed responses. Defaults to 24h. */
  ttlMs?: number;
  /** Header name. Defaults to `idempotency-key`. */
  header?: string;
  /** Methods that participate. Defaults to POST/PUT/PATCH/DELETE. */
  methods?: ReadonlySet<string> | readonly string[];
  /**
   * Request fingerprint bound to the key.
   * Default: auth subject + `METHOD path` + stable JSON of dispatch body.
   * Same key + different fingerprint → 409 CONFLICT.
   */
  fingerprint?: (ctx: RequestContext<S>) => string;
  /**
   * Scope the store key. Default: `userId` → `tenantId` → unscoped.
   * Prevents cross-principal replay of the same Idempotency-Key string.
   */
  scopeKey?: (ctx: RequestContext<S>, rawKey: string) => string;
  /** Required header? Defaults to false (skip when missing). */
  required?: boolean;
  /** Cache only 2xx responses. Defaults to true. */
  cacheSuccessOnly?: boolean;
  now?: () => number;
};

function defaultScopeKey(ctx: RequestContext, rawKey: string): string {
  const scope = ctx.auth?.userId ?? ctx.tenantId;
  return scope ? `${scope}\0${rawKey}` : rawKey;
}

function defaultFingerprint(ctx: RequestContext): string {
  const subject = ctx.auth?.userId ?? ctx.tenantId ?? "";
  const input = getDispatchInput(ctx);
  let bodyPart = "";
  try {
    bodyPart = JSON.stringify(input?.body ?? null);
  } catch {
    bodyPart = "[unserializable]";
  }
  return `${subject}\n${ctx.req.method} ${ctx.req.path}\n${bodyPart}`;
}

function replay(ctx: RequestContext, response: AppResponse): void {
  ctx.responseHeaders["idempotent-replay"] = "true";
  ctx.respond({
    status: response.status,
    headers: { ...response.headers },
    body: response.body,
  });
}

function respondProblem(
  ctx: RequestContext,
  code: (typeof ErrorCodes)[keyof typeof ErrorCodes],
  detail: string,
): void {
  ctx.respond(problemResponse(code, ctx.req.path, { detail }));
}

/**
 * Idempotency-Key middleware.
 *
 * - Missing key: skip (unless `required`)
 * - First request: run handler, cache response (2xx by default)
 * - Replay: return cached response + `Idempotent-Replay: true`
 * - In-flight same key: wait for the first request's result
 * - Same key, different fingerprint: 409 CONFLICT
 */
export function idempotency<S = unknown>(
  options: IdempotencyOptions<S> = {},
): Middleware<S> {
  const store = options.store ?? memoryIdempotencyStore({ now: options.now });
  const ttlMs = options.ttlMs ?? 24 * 60 * 60 * 1000;
  const header = (options.header ?? "idempotency-key").toLowerCase();
  const methods = options.methods
    ? new Set([...options.methods].map((m) => m.toUpperCase()))
    : DEFAULT_METHODS;
  const fingerprintFn = options.fingerprint ?? defaultFingerprint;
  const scopeKeyFn = options.scopeKey ?? defaultScopeKey;
  const required = options.required ?? false;
  const cacheSuccessOnly = options.cacheSuccessOnly ?? true;
  const clock = options.now ?? Date.now;

  if (!Number.isFinite(ttlMs) || ttlMs < 1) {
    throw new Error("@zwents/idempotency: ttlMs must be a number ≥ 1");
  }

  return async (ctx, next) => {
    if (!methods.has(ctx.req.method.toUpperCase())) {
      await next();
      return;
    }

    const raw = ctx.req.headers.get(header) ?? "";
    if (!raw) {
      if (required) {
        respondProblem(
          ctx,
          ErrorCodes.VALIDATION_ERROR,
          `Missing ${header} header`,
        );
        return;
      }
      await next();
      return;
    }

    if (!isSafeToken(raw, { maxLength: MAX_KEY_LENGTH })) {
      respondProblem(
        ctx,
        ErrorCodes.VALIDATION_ERROR,
        `Invalid ${header} header`,
      );
      return;
    }

    const storeKey = scopeKeyFn(ctx, raw);
    const fingerprint = fingerprintFn(ctx);
    const now = clock();
    const started = await store.start(storeKey, fingerprint, ttlMs, now);

    if (started.type === "replay") {
      replay(ctx, started.response);
      return;
    }

    if (started.type === "conflict") {
      respondProblem(
        ctx,
        ErrorCodes.CONFLICT,
        "Idempotency-Key was reused with a different request fingerprint",
      );
      return;
    }

    if (started.type === "overflow") {
      respondProblem(
        ctx,
        ErrorCodes.SERVICE_UNAVAILABLE,
        "Idempotency store is at capacity; retry later",
      );
      return;
    }

    if (started.type === "wait") {
      try {
        const response = await started.promise;
        replay(ctx, response);
      } catch {
        respondProblem(
          ctx,
          ErrorCodes.CONFLICT,
          "Concurrent idempotent request failed; retry with a new key",
        );
      }
      return;
    }

    const { lease } = started;

    try {
      await next();
      const response = ctx.response;
      if (!response) {
        await store.fail(storeKey, undefined, undefined, lease);
        return;
      }

      const cacheable =
        !cacheSuccessOnly || (response.status >= 200 && response.status < 300);

      if (cacheable) {
        await store.complete(storeKey, response, ttlMs, clock(), lease);
      } else {
        await store.fail(storeKey, undefined, response, lease);
      }
    } catch (error) {
      await store.fail(storeKey, error, undefined, lease);
      throw error;
    }
  };
}
