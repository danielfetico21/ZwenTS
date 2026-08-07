# Reliability notes (races, leaks, multi-instance)

Common failure modes for HTTP frameworks — and how ZwenTS handles them.

## Request isolation

- Each `dispatch` / fetch handler builds a **new** `RequestContext` (`state: Map`, `responseHeaders`, etc.).
- Do **not** stash request data on module singletons inside app code; use `ctx.state` or a keyed store with TTL.

## In-memory stores (single process)

`@zwents/ratelimit` and `@zwents/idempotency` default stores are **process-local**:

| Risk | Mitigation |
|------|------------|
| Memory growth | Opportunistic prune of expired entries; `maxKeys` ceiling |
| Abandoned idempotency waiters | Expired **in-flight** locks are pruned; waiters get rejected |
| Multi-node inconsistency | Pluggable `store` — use Redis (etc.) in production |

Concurrent hits on one Node process are safe (sync Map updates on the event loop). They are **not** a distributed lock.

## Shutdown / drain

- `app.stop()` is serialized (`stopInFlight`).
- `listen().close()` is serialized the same way; sets `draining` then waits for `inflight` (or `drainTimeoutMs`).
- `installProcessSignals` ignores duplicate signals while shutting down.
- If drain times out, the server still closes — in-flight work may see connection errors (by design).

## Timeouts & bodies

- `requestTimeoutMs` aborts via `AbortSignal`; timeout timers are cleared in `finally`.
- Oversized / aborted body reads cancel the stream reader before releasing the lock.

## What still needs ops discipline

1. **Trust `X-Forwarded-For` only behind a known proxy** (rate-limit default key).
2. **Multi-instance:** shared rate-limit / idempotency stores, sticky sessions not required if stores are shared.
3. **Handler hangs:** request timeout bounds work; idempotent waiters are freed when the lock TTL expires (or when another key triggers prune).
4. **No ORM connection pool in-framework** — close pools in `onStop` (see db-recipe).

## Regression tests

Look for `concurrent`, `prune`, `drain`, `close() is idempotent` in:

- `packages/ratelimit/tests/`
- `packages/idempotency/tests/`
- `packages/http/tests/shutdown.test.ts`
- `packages/security/tests/` (per-request header isolation)
