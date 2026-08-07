# OpenTelemetry recipe (Node)

`@zwents/otel` only depends on `@opentelemetry/api`. Spans are no-ops until the **host app** registers an SDK.

## Install

```bash
pnpm add @zwents/otel @opentelemetry/api
pnpm add @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http
# optional: auto-instrumentations
pnpm add @opentelemetry/auto-instrumentations-node
```

## Bootstrap (before listening)

```ts
// instrumentation.ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    // e.g. http://localhost:4318/v1/traces
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

process.on("SIGTERM", () => {
  void sdk.shutdown();
});
```

Run with:

```bash
node --import ./dist/instrumentation.js dist/main.js
```

## Wire into ZwenTS

```ts
import { createApp } from "@zwents/core";
import { otelHttp } from "@zwents/otel";
import { listen } from "@zwents/http";

const app = createApp({ context: services })
  .use(otelHttp()) // early in the pipeline
  .route(/* ... */);

await listen(app, { port: 3000 });
```

`otelHttp()` sets `ctx.trace = { traceId, spanId }` for log correlation and records:

- `http.request.method`, `url.path`, `zwents.request_id`
- On thrown errors with `code`/`status`: `error.type`, `http.response.status_code`
- 5xx → span status ERROR; 4xx → OK (client fault)

## Local collector

Jaeger all-in-one (OTLP):

```bash
docker run --rm -p 16686:16686 -p 4318:4318 jaegertracing/all-in-one:latest
```

UI: http://localhost:16686
