# Health endpoints recipe

Expose cheap probes for orchestrators (Kubernetes, load balancers).

| Path | Meaning |
|------|---------|
| `GET /health` | **Liveness** — process is up (no dependency checks) |
| `GET /ready` | **Readiness** — can serve traffic (DB/pool/etc.) |

## Snippet

```ts
app.route(
  route({
    method: "GET",
    path: "/health",
    security: false,
    output: z.object({ status: z.literal("ok") }),
    handler: async () => ({ status: "ok" as const }),
  }),
);

app.route(
  route({
    method: "GET",
    path: "/ready",
    security: false,
    output: z.object({
      status: z.enum(["ready", "not_ready"]),
      checks: z.record(z.string(), z.boolean()),
    }),
    errors: { 503: problemSchema },
    handler: async (ctx) => {
      const dbOk = await ctx.services.db.ping(); // your method
      if (!dbOk) {
        throw appError(ErrorCodes.SERVICE_UNAVAILABLE, {
          detail: "database not ready",
          extras: { checks: { db: false } },
        });
      }
      return { status: "ready" as const, checks: { db: true } };
    },
  }),
);
```

Wired in [`examples/notes-api`](../examples/notes-api/) (`/health`, `/ready` against the in-memory store).

## Tips

- Keep `/health` allocation-free and auth-free
- `/ready` may return **503** Problem Details while dependencies heal
- Do not put `/ready` behind rate limits that can false-fail the probe (or exclude those paths)
