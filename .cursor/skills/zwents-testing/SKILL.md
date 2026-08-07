---
name: zwents-testing
description: >-
  Write thorough Vitest suites for ZwenTS packages with edge-case coverage
  (middleware short-circuit, header injection, concurrency, error paths).
  Use when adding or changing @zwents/* features, writing tests, or the user
  asks for complete edge-case coverage.
---

# ZwenTS testing

## Rules

1. Import only through package entrypoints (`../index.js`), never `lib/`.
2. Prefer `createApp` + `dispatch` for middleware/HTTP behavior; use `@zwents/test` when a real listen is required.
3. One behavior per `it`; name the edge case in the title (`rejects …`, `allows …`, `does not …`).
4. Cover **happy path + every branch + adversarial input** before marking done.
5. Assert status, `content-type`, body shape, and **response headers** when the feature sets them.

## Edge-case checklist (middleware)

- [ ] Missing / empty / whitespace-only headers
- [ ] Case-insensitive header names
- [ ] Multiple values / spoofed commas where relevant
- [ ] Header injection (`\\r\\n`, oversized, non-ASCII)
- [ ] Short-circuit via `ctx.respond` skips handler
- [ ] Headers still applied on **error** responses (404/500/Problem Details)
- [ ] OPTIONS / methods without a matching route (CORS preflight)
- [ ] `next()` not called vs called exactly once
- [ ] Concurrent requests do not share mutable state (no module-level request bags)
- [ ] Clock / limiter boundaries (exactly at limit, just under, just over)

## Concurrency / races

```ts
it("isolates per-request state under concurrency", async () => {
  const app = createApp({ context: {} }).use(mw).route({...});
  const results = await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      app.dispatch({ method: "GET", path: "/", headers: new Headers({ "x-id": String(i) }) }),
    ),
  );
  // each response must match its own request identity
});
```

Do **not** store request-scoped data on module singletons unless behind a keyed store with TTL + tests for eviction.

## Result / errors

- Assert `application/problem+json` for `AppError` paths.
- When handlers return `Result`, cover both `ok` and `err(AppError)`.
