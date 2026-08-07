# Graceful shutdown

Contract for stopping a ZwenTS process cleanly.

## Order

1. Signal (`SIGTERM` / `SIGINT`) or explicit `app.stop()`
2. HTTP adapter marks **draining** — new requests get `503 SERVICE_UNAVAILABLE`
3. Wait for **in-flight** requests (up to `drainTimeoutMs`, default 10s)
4. Close the HTTP server socket
5. Run `onStop` hooks in **reverse** registration order (DB pools, etc.)
6. `app.started === false`

`listen()` registers the drain+close step as an `onStop` hook automatically.

## Recommended wiring

```ts
import { listen, installProcessSignals } from "@zwents/http";

const handle = await listen(app, {
  port: 3000,
  drainTimeoutMs: 10_000,
  requestTimeoutMs: 30_000,
});

installProcessSignals(app, {
  timeoutMs: 10_000,
  fatalErrors: true,
  onFatalError: (error, kind) => console.error(`[fatal] ${kind}`, error),
});
```

## Rules

| Topic | Behavior |
|-------|----------|
| Concurrent `stop()` | Serialized — hooks run once |
| `STOP_TIMEOUT` | `started` stays `true`; call `stop()` again to retry |
| Drain timeout | Server closes even if some requests remain |
| `fatalErrors` | Optional; on unhandledRejection/uncaughtException → log, `stop()`, exit(1). Default **off**. |

## Checklist

- Register infra close in `onStop` (pools, queues)
- Use `installProcessSignals` with `fatalErrors: true` in real entrypoints
- Keep `requestTimeoutMs` ≤ drain budget
