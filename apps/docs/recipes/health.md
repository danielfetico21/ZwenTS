# Health & readiness

| Path | Role |
|------|------|
| `GET /health` | Liveness — process up |
| `GET /ready` | Readiness — dependencies OK |

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
    handler: async (ctx) => {
      const dbOk = await ctx.services.db.ping();
      if (!dbOk) {
        throw appError(ErrorCodes.SERVICE_UNAVAILABLE, {
          detail: "database not ready",
        });
      }
      return { status: "ready" as const, checks: { db: true } };
    },
  }),
);
```

See `examples/notes-api` and monorepo `docs/health-recipe.md`.
