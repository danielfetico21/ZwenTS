import {
  createRequestContext,
  type RequestContext,
} from "./context.js";
import { AppError, ErrorCodes, toProblemDetails } from "./errors.js";
import {
  composeMiddleware,
  type ErrorHandler,
  type Middleware,
} from "./middleware.js";
import {
  json,
  mergeResponseHeaders,
  problemJson,
  type AppResponse,
} from "./response.js";
import { unwrapHandlerResult } from "./result-http.js";
import {
  compileRoute,
  matchRoute,
  type DispatchInput,
  type RouteDefinition,
} from "./route.js";

export type { AppResponse } from "./response.js";
export {
  json,
  mergeResponseHeaders,
  problemJson,
  problemResponse,
} from "./response.js";

export type LifecycleHook = () => Promise<void> | void;

export type StartOptions = {
  /** Reserved for HTTP adapters (port/host). Core only runs lifecycle hooks. */
  port?: number;
  host?: string;
};

export type AppOptions<S> = {
  context: S;
  onStart?: readonly LifecycleHook[];
  onStop?: readonly LifecycleHook[];
};

/** State key for adapter-parsed dispatch input (body/query/raw/files). */
export const DISPATCH_INPUT_STATE_KEY = "@zwents/dispatchInput" as const;

/** State key for the matched route path template (e.g. `/notes/:id`). */
export const MATCHED_ROUTE_STATE_KEY = "@zwents/matchedRoute" as const;

export type DispatchRequest = {
  method: string;
  path: string;
  headers?: Headers;
  requestId?: string;
  signal?: AbortSignal;
  /** Parsed input for the handler (body/query/raw/files). Adapters fill this. */
  input?: DispatchInput;
};

/** Read adapter-parsed dispatch input from request state (if present). */
export function getDispatchInput(
  ctx: RequestContext,
): DispatchInput | undefined {
  const value = ctx.state.get(DISPATCH_INPUT_STATE_KEY);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as DispatchInput;
}

/** Matched route path template when a route matched (low-cardinality). */
export function getMatchedRoutePath(
  ctx: RequestContext,
): string | undefined {
  const value = ctx.state.get(MATCHED_ROUTE_STATE_KEY);
  return typeof value === "string" ? value : undefined;
}

export type App<S = unknown> = {
  use: (...middleware: Middleware<S>[]) => App<S>;
  route: <TInput = unknown, TOutput = unknown>(
    definition: RouteDefinition<S, TInput, TOutput>,
  ) => App<S>;
  onError: (handler: ErrorHandler<S>) => App<S>;
  onStart: (hook: LifecycleHook) => App<S>;
  onStop: (hook: LifecycleHook) => App<S>;
  /** Engine-agnostic dispatch for tests and adapters. */
  dispatch: (request: DispatchRequest) => Promise<AppResponse>;
  start: (options?: StartOptions) => Promise<void>;
  stop: (options?: { timeoutMs?: number }) => Promise<void>;
  readonly context: S;
  readonly started: boolean;
  /** Registered route definitions (for OpenAPI / CLI). */
  readonly routes: readonly RouteDefinition<S>[];
  /** App-level middleware (for OpenAPI security discovery). */
  readonly middleware: readonly Middleware<S>[];
};

function defaultErrorHandler(error: unknown): AppResponse {
  const details = toProblemDetails(error);
  return problemJson(details, details.status);
}

export function createApp<S>(options: AppOptions<S>): App<S> {
  const appMiddleware: Middleware<S>[] = [];
  const compiledRoutes: ReturnType<typeof compileRoute>[] = [];
  const startHooks: LifecycleHook[] = [...(options.onStart ?? [])];
  const stopHooks: LifecycleHook[] = [...(options.onStop ?? [])];
  let errorHandler: ErrorHandler<S> = defaultErrorHandler;
  let started = false;
  /** Index of the next start hook to run (resumes after partial failure). */
  let startHookIndex = 0;
  /** Serializes concurrent `start()` calls. */
  let startInFlight: Promise<void> | null = null;
  /** Serializes concurrent `stop()` calls. */
  let stopInFlight: Promise<void> | null = null;

  const app: App<S> = {
    context: options.context,
    get started() {
      return started;
    },
    get routes() {
      return compiledRoutes.map((entry) => entry.definition as RouteDefinition<S>);
    },

    get middleware() {
      return appMiddleware;
    },

    use(...middleware) {
      appMiddleware.push(...middleware);
      return app;
    },

    route(definition) {
      compiledRoutes.push(compileRoute(definition as RouteDefinition));
      return app;
    },

    onError(handler) {
      errorHandler = handler;
      return app;
    },

    onStart(hook) {
      startHooks.push(hook);
      return app;
    },

    onStop(hook) {
      stopHooks.push(hook);
      return app;
    },

    async dispatch(request) {
      let response: AppResponse | undefined;

      const ctx = createRequestContext({
        services: options.context,
        method: request.method,
        path: request.path,
        headers: request.headers,
        requestId: request.requestId,
        signal: request.signal,
      });

      const setResponse = (value: AppResponse): void => {
        response = value;
        ctx.response = value;
      };
      ctx.respond = setResponse;
      ctx.state.set(DISPATCH_INPUT_STATE_KEY, request.input);

      const match = matchRoute(compiledRoutes, request.method, request.path);
      if (match) {
        ctx.state.set(MATCHED_ROUTE_STATE_KEY, match.route.path);
      }
      const routeMiddleware = match?.route.middleware ?? [];
      const pipeline = composeMiddleware<S>([
        ...appMiddleware,
        ...routeMiddleware,
      ]);

      const finalize = (value: AppResponse): AppResponse =>
        mergeResponseHeaders(value, ctx.responseHeaders);

      try {
        await pipeline(ctx, async () => {
          if (response !== undefined) return;
          if (!match) {
            throw new AppError(ErrorCodes.NOT_FOUND, 404, {
              detail: `No route for ${request.method} ${request.path}`,
            });
          }
          const rawInput = request.input ?? {};
          const output = await match.route.handler(ctx, {
            params: match.params,
            query: rawInput.query,
            body: rawInput.body,
            raw: rawInput.raw,
            files: rawInput.files,
          });
          if (response === undefined) {
            setResponse(json(unwrapHandlerResult(output)));
          }
        });
        return finalize(response ?? json(null, 204));
      } catch (error) {
        try {
          const handled = await errorHandler(error, ctx);
          setResponse(handled);
          return finalize(handled);
        } catch (handlerError) {
          const handled = defaultErrorHandler(handlerError);
          setResponse(handled);
          return finalize(handled);
        }
      }
    },

    async start(_options = {}) {
      if (started) {
        throw new AppError(ErrorCodes.ALREADY_STARTED, 500, {
          detail: "App.start() called more than once",
        });
      }
      if (startInFlight) return startInFlight;

      startInFlight = (async () => {
        try {
          // Resume after a partial failure so successful hooks are not re-run.
          while (startHookIndex < startHooks.length) {
            const hook = startHooks[startHookIndex]!;
            await hook();
            startHookIndex += 1;
          }
          started = true;
        } finally {
          startInFlight = null;
        }
      })();

      return startInFlight;
    },

    async stop(stopOptions = {}) {
      if (!started) return;
      if (stopInFlight) return stopInFlight;

      const timeoutMs = stopOptions.timeoutMs ?? 10_000;
      const runPromise = (async (): Promise<void> => {
        for (const hook of stopHooks.toReversed()) {
          await hook();
        }
      })();

      stopInFlight = (async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            runPromise,
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                reject(
                  new AppError(ErrorCodes.STOP_TIMEOUT, 500, {
                    detail: `App.stop() exceeded ${timeoutMs}ms`,
                  }),
                );
              }, timeoutMs);
            }),
          ]);
          started = false;
        } finally {
          if (timer !== undefined) clearTimeout(timer);
          // Always let orphaned hooks finish before releasing the lock so a
          // retry cannot overlap the first attempt. `started` stays true on
          // timeout so callers may retry after this settles.
          await runPromise.catch(() => undefined);
          stopInFlight = null;
        }
      })();

      return stopInFlight;
    },
  };

  return app;
}
