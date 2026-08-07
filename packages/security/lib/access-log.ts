import {
  isAppError,
  type Middleware,
  type RequestContext,
} from "@zwents/core";

export type AccessLogEntry = {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  requestId: string;
};

export type AccessLogOptions = {
  /**
   * Custom sink. Defaults to `ctx.logger.info("request", entry)`.
   */
  log?: (entry: AccessLogEntry, ctx: RequestContext) => void;
  /** Skip logging for matching requests (e.g. `/health`). */
  skip?: (ctx: RequestContext) => boolean;
};

/**
 * Resolve status for post-pipeline sinks.
 * Outer error mapping may run after this middleware's `finally`, so unknown
 * throws default to 500 (same as the default error handler).
 * Intentional twin of `@zwents/otel` `otelHttpMetrics` status resolution.
 */
function resolveStatus(
  ctx: RequestContext,
  thrown: unknown,
): number {
  if (ctx.response?.status !== undefined) return ctx.response.status;
  if (isAppError(thrown)) return thrown.status;
  if (thrown !== undefined) return 500;
  return 0;
}

/**
 * Structured access log after the pipeline (success and error responses).
 * Place early (with `requestId`) so duration covers most of the stack.
 *
 * When a handler throws before `ctx.response` is set, status is taken from
 * `AppError.status` when possible; other throws log as `500`.
 */
export function accessLog(options: AccessLogOptions = {}): Middleware {
  return async (ctx, next) => {
    if (options.skip?.(ctx)) {
      await next();
      return;
    }

    const start = performance.now();
    let thrown: unknown;
    try {
      await next();
    } catch (error) {
      thrown = error;
      throw error;
    } finally {
      const entry: AccessLogEntry = {
        method: ctx.req.method,
        path: ctx.req.path,
        status: resolveStatus(ctx, thrown),
        durationMs: Math.round(performance.now() - start),
        requestId: ctx.requestId,
      };
      try {
        if (options.log) {
          options.log(entry, ctx);
        } else {
          ctx.logger.info("request", entry);
        }
      } catch {
        // Never mask pipeline / handler errors from the sink.
      }
    }
  };
}
