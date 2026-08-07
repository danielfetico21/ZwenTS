# Metrics recipe (OpenTelemetry)

Traces: `otelHttp()` — see [otel-recipe.md](./otel-recipe.md).

Counters / histograms: `otelHttpMetrics()` from `@zwents/otel` (peer `@opentelemetry/api`).

```ts
import { otelHttp, otelHttpMetrics } from "@zwents/otel";

app.use(otelHttp());
app.use(otelHttpMetrics());
```

Instruments (no-op until a metrics SDK is registered):

- `http.server.request.count`
- `http.server.request.duration` (ms)

Attributes: `http.request.method`, `http.response.status_code`, and
`http.route` when a route matched (path **template**, e.g. `/notes/:id` —
not the raw URL with IDs).

Prometheus export is configured in **your** SDK (e.g. `@opentelemetry/exporter-prometheus` / OTLP), not inside ZwenTS.
