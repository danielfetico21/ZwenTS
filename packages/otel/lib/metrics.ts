import { metrics, type Attributes, type Meter } from "@opentelemetry/api";
import {
  getMatchedRoutePath,
  isAppError,
  type Middleware,
  type RequestContext,
} from "@zwents/core";

export type OtelHttpMetricsOptions = {
  /** Meter name. Defaults to `@zwents/otel`. */
  meterName?: string;
  meterVersion?: string;
  /**
   * Extra attributes per request.
   * Avoid high-cardinality labels (raw paths with IDs).
   */
  attributes?: (info: {
    method: string;
    /** Matched route template when available; otherwise request path. */
    path: string;
    /** Matched route template (`/notes/:id`), if any. */
    route?: string;
    status: number;
  }) => Attributes;
};

/**
 * Resolve status for post-pipeline sinks.
 * Intentional twin of `@zwents/security` `accessLog` status resolution.
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
 * OpenTelemetry HTTP metrics middleware (request count + duration).
 *
 * Uses `@opentelemetry/api` only (peer). Register a metrics SDK / exporter
 * in the host app; without one this is a safe no-op.
 *
 * Default `http.route` is the **matched path template** (low cardinality),
 * omitted when no route matched. Do not put raw request paths with IDs
 * into attributes unless you accept series explosion.
 */
export function otelHttpMetrics(
  options: OtelHttpMetricsOptions = {},
): Middleware {
  const meterName = options.meterName ?? "@zwents/otel";
  const meterVersion = options.meterVersion;
  let meter: Meter | undefined;
  let requestCounter:
    | ReturnType<Meter["createCounter"]>
    | undefined;
  let durationHistogram:
    | ReturnType<Meter["createHistogram"]>
    | undefined;

  const ensureInstruments = (): void => {
    if (meter) return;
    meter = metrics.getMeter(meterName, meterVersion);
    requestCounter = meter.createCounter("http.server.request.count", {
      description: "HTTP server request count",
      unit: "1",
    });
    durationHistogram = meter.createHistogram(
      "http.server.request.duration",
      {
        description: "HTTP server request duration",
        unit: "ms",
      },
    );
  };

  return async (ctx, next) => {
    ensureInstruments();
    const start = performance.now();
    let thrown: unknown;
    try {
      await next();
    } catch (error) {
      thrown = error;
      throw error;
    } finally {
      const status = resolveStatus(ctx, thrown);
      const durationMs = performance.now() - start;
      const route = getMatchedRoutePath(ctx);
      const base = {
        method: ctx.req.method,
        path: route ?? ctx.req.path,
        route,
        status,
      };
      const attrs: Attributes = {
        "http.request.method": base.method,
        "http.response.status_code": status,
        ...options.attributes?.(base),
      };
      if (route !== undefined) {
        attrs["http.route"] = route;
      }
      try {
        requestCounter!.add(1, attrs);
        durationHistogram!.record(durationMs, attrs);
      } catch {
        // Never mask pipeline / handler errors from the sink.
      }
    }
  };
}
