import { afterEach, describe, expect, it, vi } from "vitest";
import {
  metrics,
  type Counter,
  type Histogram,
  type Meter,
} from "@opentelemetry/api";
import { appError, createApp, ErrorCodes } from "@zwents/core";
import { otelHttpMetrics } from "../index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function mockMeter(): {
  add: ReturnType<typeof vi.fn>;
  record: ReturnType<typeof vi.fn>;
  getMeter: ReturnType<typeof vi.spyOn>;
} {
  const add = vi.fn();
  const record = vi.fn();
  const meter = {
    createCounter: () => ({ add }) as unknown as Counter,
    createHistogram: () => ({ record }) as unknown as Histogram,
  } as unknown as Meter;
  const getMeter = vi.spyOn(metrics, "getMeter").mockReturnValue(meter);
  return { add, record, getMeter };
}

describe("otelHttpMetrics", () => {
  it("records count and duration on success with matched route template", async () => {
    const { add, record } = mockMeter();

    const app = createApp({ context: {} })
      .use(otelHttpMetrics())
      .route({
        method: "GET",
        path: "/notes/:id",
        handler: async () => ({ ok: true }),
      });

    const res = await app.dispatch({ method: "GET", path: "/notes/abc" });
    expect(res.status).toBe(200);
    expect(add).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledOnce();
    expect(add.mock.calls[0]?.[1]).toMatchObject({
      "http.request.method": "GET",
      "http.route": "/notes/:id",
      "http.response.status_code": 200,
    });
    expect(add.mock.calls[0]?.[1]["http.route"]).not.toBe("/notes/abc");
  });

  it("omits http.route when no route matched", async () => {
    const { add } = mockMeter();

    const app = createApp({ context: {} }).use(otelHttpMetrics());

    const res = await app.dispatch({ method: "GET", path: "/missing" });
    expect(res.status).toBe(404);
    expect(add.mock.calls[0]?.[1]).toMatchObject({
      "http.response.status_code": 404,
    });
    expect(add.mock.calls[0]?.[1]).not.toHaveProperty("http.route");
  });

  it("records AppError status when handler throws", async () => {
    const { add, record } = mockMeter();

    const app = createApp({ context: {} })
      .use(otelHttpMetrics())
      .route({
        method: "GET",
        path: "/missing",
        handler: async () => {
          throw appError(ErrorCodes.NOT_FOUND, { detail: "x" });
        },
      });

    const res = await app.dispatch({ method: "GET", path: "/missing" });
    expect(res.status).toBe(404);
    expect(add.mock.calls[0]?.[1]).toMatchObject({
      "http.response.status_code": 404,
    });
    expect(record).toHaveBeenCalledOnce();
  });

  it("records status 500 for non-AppError throws", async () => {
    const { add } = mockMeter();

    const app = createApp({ context: {} })
      .use(otelHttpMetrics())
      .route({
        method: "GET",
        path: "/boom",
        handler: async () => {
          throw new Error("raw");
        },
      });

    const res = await app.dispatch({ method: "GET", path: "/boom" });
    expect(res.status).toBe(500);
    expect(add.mock.calls[0]?.[1]).toMatchObject({
      "http.response.status_code": 500,
    });
  });

  it("merges options.attributes and passes meterName/version to getMeter", async () => {
    const { add, getMeter } = mockMeter();

    const app = createApp({ context: {} })
      .use(
        otelHttpMetrics({
          meterName: "custom.meter",
          meterVersion: "9.9.9",
          attributes: () => ({ "service.name": "demo" }),
        }),
      )
      .route({
        method: "GET",
        path: "/ok",
        handler: async () => ({ ok: true }),
      });

    await app.dispatch({ method: "GET", path: "/ok" });
    expect(getMeter).toHaveBeenCalledWith("custom.meter", "9.9.9");
    expect(add.mock.calls[0]?.[1]).toMatchObject({
      "service.name": "demo",
      "http.route": "/ok",
    });
  });

  it("does not mask handler errors when metric sink throws", async () => {
    const add = vi.fn(() => {
      throw new Error("sink");
    });
    const record = vi.fn();
    const meter = {
      createCounter: () => ({ add }) as unknown as Counter,
      createHistogram: () => ({ record }) as unknown as Histogram,
    } as unknown as Meter;
    vi.spyOn(metrics, "getMeter").mockReturnValue(meter);

    const app = createApp({ context: {} })
      .use(otelHttpMetrics())
      .route({
        method: "GET",
        path: "/boom",
        handler: async () => {
          throw appError(ErrorCodes.NOT_FOUND, { detail: "x" });
        },
      });

    const res = await app.dispatch({ method: "GET", path: "/boom" });
    expect(res.status).toBe(404);
  });
});
