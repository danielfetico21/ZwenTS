import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
  type TextMapGetter,
} from "@opentelemetry/api";
import { isAppError, type Middleware } from "@zwents/core";

export type OtelHttpOptions = {
  /** Tracer name. Defaults to `@zwents/otel`. */
  tracerName?: string;
  tracerVersion?: string;
};

const headerGetter: TextMapGetter<Headers> = {
  /* v8 ignore next 3 -- only some propagators call keys() */
  keys(carrier) {
    return [...carrier.keys()];
  },
  get(carrier, key) {
    return carrier.get(key) ?? undefined;
  },
};

/**
 * OpenTelemetry HTTP server middleware.
 *
 * Uses `@opentelemetry/api` only (peer). Register an SDK in the host app
 * (e.g. NodeSDK) to export spans; without an SDK this is a safe no-op.
 *
 * Sets `ctx.trace = { traceId, spanId }` for correlation with logs.
 *
 * Resolves the tracer per request so a late `setGlobalTracerProvider` is picked up.
 */
export function otelHttp(options: OtelHttpOptions = {}): Middleware {
  const tracerName = options.tracerName ?? "@zwents/otel";
  const tracerVersion = options.tracerVersion;

  return async (ctx, next) => {
    const tracer = trace.getTracer(tracerName, tracerVersion);
    const parentContext = propagation.extract(
      context.active(),
      ctx.req.headers,
      headerGetter,
    );

    const span = tracer.startSpan(
      `${ctx.req.method} ${ctx.req.path}`,
      {
        kind: SpanKind.SERVER,
        attributes: {
          "http.request.method": ctx.req.method,
          "url.path": ctx.req.path,
          "zwents.request_id": ctx.requestId,
        },
      },
      parentContext,
    );

    const spanContext = span.spanContext();
    ctx.trace = {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
    };

    try {
      await context.with(trace.setSpan(parentContext, span), async () => {
        await next();
      });
      finishFromResponse(span, ctx.response?.status);
    } catch (error) {
      finishError(span, error);
      throw error;
    } finally {
      span.end();
    }
  };
}

function finishFromResponse(span: Span, status: number | undefined): void {
  const code = status ?? 200;
  span.setAttribute("http.response.status_code", code);
  if (code >= 500) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: `HTTP ${code}`,
    });
    return;
  }
  span.setStatus({ code: SpanStatusCode.OK });
}

function finishError(span: Span, error: unknown): void {
  if (error instanceof Error) {
    span.recordException(error);
  }

  if (isAppError(error)) {
    span.setAttribute("error.type", error.code);
    span.setAttribute("http.response.status_code", error.status);
    if (error.status >= 500) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.code,
      });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }
    return;
  }

  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error instanceof Error ? error.message : "unknown",
  });
}
