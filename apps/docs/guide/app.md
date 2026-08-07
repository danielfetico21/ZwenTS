# App & middleware

## Create an app

```ts
import { createApp } from "@zwents/core";

const app = createApp({
  context: { db, tokens }, // typed services
  onStop: [() => db.close()],
});
```

`context` is available as `ctx.services` in handlers and middleware.

## Register middleware

```ts
app
  .use(requestId())
  .use(securityHeaders({ strictTransportSecurity: false }))
  .use(cors({ origin: ["http://localhost:5173"] }))
  .use(rateLimit({ limit: 100, windowMs: 60_000 }))
  .use(bearerAuth({ verify, required: false }));
```

Order is part of the [semver contract](/reference/semver): app middleware runs before route middleware, left-to-right onion.

### Recommended stack order

1. `requestId` / OTEL  
2. `cors` / `securityHeaders`  
3. `rateLimit`  
4. Auth (`bearerAuth` → `requireAuth` / `authorize`)  
5. `idempotency` on mutating routes  
6. Handler  

## Short-circuit vs throw

| Pattern | Use when |
|---------|----------|
| `ctx.respond(problemResponse(...))` | Expected HTTP failure (401, 429, …) — do **not** call `next()` |
| `throw appError(...)` | Validation / body / unexpected — shared `onError` |

## Lifecycle

```ts
await app.start(); // runs onStart hooks (serialized)
await app.stop({ timeoutMs: 10_000 });
```

HTTP: `listen` registers drain+close as an `onStop` hook. See [Graceful shutdown](/recipes/shutdown).

## Testing without a port

```ts
const res = await app.dispatch({
  method: "GET",
  path: "/hello",
  input: { query: { shout: "true" } },
});
```
