# OpenTelemetry

`@zwents/otel` depends only on `@opentelemetry/api`. Spans are no-ops until the host app registers an SDK.

## Install

```bash
pnpm add @zwents/otel @opentelemetry/api
pnpm add @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http
```

## Middleware

```ts
import { otelHttp } from "@zwents/otel";

app.use(otelHttp());
```

Sets `ctx.trace = { traceId, spanId }` when a provider is active. Prefer placing OTEL early in the stack (with `requestId`).

## Bootstrap

Register your NodeSDK **before** listening (e.g. `node --import ./dist/instrumentation.js dist/main.js`). Full sample lives in the monorepo `docs/otel-recipe.md`.
