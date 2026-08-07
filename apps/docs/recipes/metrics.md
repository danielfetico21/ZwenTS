# Metrics (OpenTelemetry)

```ts
import { otelHttp, otelHttpMetrics } from "@zwents/otel";

app.use(otelHttp());
app.use(otelHttpMetrics());
```

Emits `http.server.request.count` and `http.server.request.duration` via `@opentelemetry/api`. Register a metrics SDK/exporter in the host app (Prometheus/OTLP).

`http.route` is the matched path template (e.g. `/notes/:id`), not the raw URL.

More: monorepo `docs/metrics-recipe.md`.
