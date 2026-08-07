import { AppError, createApp } from "@zwents/core";
import { propagation, trace } from "@opentelemetry/api";
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from "@opentelemetry/core";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { otelHttp } from "../index.js";

describe("otelHttp", () => {
  const exporter = new InMemorySpanExporter();
  let provider: BasicTracerProvider;

  beforeAll(() => {
    provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    trace.setGlobalTracerProvider(provider);
    propagation.setGlobalPropagator(
      new CompositePropagator({
        propagators: [
          new W3CTraceContextPropagator(),
          new W3CBaggagePropagator(),
        ],
      }),
    );
  });

  beforeEach(() => {
    exporter.reset();
  });

  afterAll(async () => {
    await provider.shutdown();
    // @opentelemetry/api registers a global provider only once; shutdown is
    // the supported cleanup (cannot fully restore a prior provider).
  });

  it("creates a server span and sets ctx.trace", async () => {
    const app = createApp({ context: {} })
      .use(otelHttp())
      .route({
        method: "GET",
        path: "/ping",
        handler: async (ctx) => ({
          traceId: ctx.trace?.traceId,
          spanId: ctx.trace?.spanId,
        }),
      });

    const res = await app.dispatch({ method: "GET", path: "/ping" });
    expect(res.status).toBe(200);
    const body = res.body as { traceId: string; spanId: string };
    expect(body.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(body.spanId).toMatch(/^[0-9a-f]{16}$/);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("GET /ping");
    expect(spans[0]?.attributes["http.request.method"]).toBe("GET");
    expect(spans[0]?.attributes["url.path"]).toBe("/ping");
    expect(spans[0]?.attributes["http.response.status_code"]).toBe(200);
  });

  it("marks non-throwing 5xx responses as ERROR", async () => {
    const app = createApp({ context: {} })
      .use(otelHttp())
      .route({
        method: "GET",
        path: "/fail",
        handler: async (ctx) => {
          ctx.respond({
            status: 500,
            headers: { "content-type": "application/json" },
            body: { err: true },
          });
        },
      });

    const res = await app.dispatch({ method: "GET", path: "/fail" });
    expect(res.status).toBe(500);

    const spans = exporter.getFinishedSpans();
    expect(spans[0]?.attributes["http.response.status_code"]).toBe(500);
    expect(spans[0]?.status.code).toBe(2);
  });

  it("records AppError code on 5xx", async () => {
    const app = createApp({ context: {} })
      .use(otelHttp())
      .route({
        method: "GET",
        path: "/boom",
        handler: async () => {
          throw new AppError("INTERNAL_ERROR", 500, { detail: "nope" });
        },
      });

    const res = await app.dispatch({ method: "GET", path: "/boom" });
    expect(res.status).toBe(500);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.attributes["error.type"]).toBe("INTERNAL_ERROR");
    expect(spans[0]?.attributes["http.response.status_code"]).toBe(500);
  });

  it("keeps span OK for 4xx AppError responses", async () => {
    const app = createApp({ context: {} })
      .use(otelHttp({ tracerName: "test-tracer", tracerVersion: "1.0.0" }))
      .route({
        method: "GET",
        path: "/missing",
        handler: async () => {
          throw new AppError("NOT_FOUND", 404, { detail: "nope" });
        },
      });

    const res = await app.dispatch({ method: "GET", path: "/missing" });
    expect(res.status).toBe(404);

    const spans = exporter.getFinishedSpans();
    expect(spans[0]?.attributes["error.type"]).toBe("NOT_FOUND");
    expect(spans[0]?.status.code).not.toBe(2);
  });

  it("marks generic thrown errors as ERROR", async () => {
    const app = createApp({ context: {} })
      .use(otelHttp())
      .route({
        method: "GET",
        path: "/fail",
        handler: async () => {
          throw new Error("unexpected");
        },
      });

    await app.dispatch({ method: "GET", path: "/fail" });
    const spans = exporter.getFinishedSpans();
    expect(spans[0]?.status.code).toBe(2);
    expect(spans[0]?.status.message).toBe("unexpected");
  });

  it("extracts trace context from incoming headers", async () => {
    const app = createApp({ context: {} })
      .use(otelHttp())
      .route({
        method: "GET",
        path: "/trace",
        handler: async () => ({ ok: true }),
      });

    const res = await app.dispatch({
      method: "GET",
      path: "/trace",
      headers: new Headers({
        traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        baggage: "userId=alice",
      }),
    });
    expect(res.status).toBe(200);
    expect(exporter.getFinishedSpans()).toHaveLength(1);
  });
});
