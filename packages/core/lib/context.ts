export type AuthPrincipal = {
  userId: string;
  roles: readonly string[];
};

export type Logger = {
  debug: (message: string, bindings?: Record<string, unknown>) => void;
  info: (message: string, bindings?: Record<string, unknown>) => void;
  warn: (message: string, bindings?: Record<string, unknown>) => void;
  error: (message: string, bindings?: Record<string, unknown>) => void;
  child: (bindings: Record<string, unknown>) => Logger;
};

export type RequestMeta = {
  method: string;
  path: string;
  headers: Headers;
};

export type TraceInfo = {
  traceId: string;
  spanId: string;
};

export type RequestContext<S = unknown> = {
  requestId: string;
  signal: AbortSignal;
  auth: AuthPrincipal | null;
  tenantId?: string;
  logger: Logger;
  /** Filled by `@zwents/otel` when tracing is active. */
  trace?: TraceInfo;
  services: S;
  req: RequestMeta;
  /** Short-circuit the pipeline with a response (middleware / adapters). */
  respond: (response: import("./response.js").AppResponse) => void;
  /**
   * Latest response produced by `respond` or the route handler.
   * Readable after `await next()` for caching middleware (e.g. idempotency).
   */
  response?: import("./response.js").AppResponse;
  /**
   * Headers merged onto the final `AppResponse` (success and errors).
   * Middleware should write lowercase keys (e.g. `x-request-id`).
   */
  responseHeaders: Record<string, string>;
  /** Middleware/extension bag — prefer typed helpers over ad-hoc keys. */
  state: Map<string, unknown>;
};

const noop = (): void => undefined;

export function createSilentLogger(): Logger {
  const logger: Logger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => logger,
  };
  return logger;
}

export function createRequestContext<S>(input: {
  services: S;
  method: string;
  path: string;
  headers?: Headers;
  requestId?: string;
  signal?: AbortSignal;
  auth?: AuthPrincipal | null;
  tenantId?: string;
  logger?: Logger;
  respond?: (response: import("./response.js").AppResponse) => void;
}): RequestContext<S> {
  return {
    requestId: input.requestId ?? crypto.randomUUID(),
    signal: input.signal ?? new AbortController().signal,
    auth: input.auth ?? null,
    tenantId: input.tenantId,
    logger: input.logger ?? createSilentLogger(),
    services: input.services,
    req: {
      method: input.method,
      path: input.path,
      headers: input.headers ?? new Headers(),
    },
    respond: input.respond ?? (() => undefined),
    responseHeaders: {},
    state: new Map(),
  };
}
