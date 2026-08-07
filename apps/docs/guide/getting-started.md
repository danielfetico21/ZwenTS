# Getting started

Minimal path: an app with Zod routes, config from env, and Node HTTP.

## Requirements

- Node.js ≥ 22
- pnpm (monorepo uses pnpm workspaces)

## Install (workspace)

From the ZwenTS monorepo root:

```bash
pnpm install
pnpm build
```

App packages live under `packages/*`. Examples under `examples/*`.

## Minimal app

```ts
import { createApp, appError, ErrorCodes, err, ok } from "@zwents/core";
import { loadConfig } from "@zwents/config";
import { problemSchema, route } from "@zwents/schema";
import { z } from "zod";

const config = loadConfig(
  z.object({
    PORT: z.coerce.number().int().positive().default(3000),
    HOST: z.string().default("127.0.0.1"),
  }),
);

export const app = createApp({
  context: { hello: () => "zwents" },
})
  .route(
    route({
      method: "GET",
      path: "/hello",
      query: z.object({
        shout: z.enum(["true", "false"]).optional(),
      }),
      output: z.object({ message: z.string() }),
      errors: { 400: problemSchema },
      handler: async (ctx, input) => {
        const message = ctx.services.hello();
        return {
          message:
            input.query?.shout === "true" ? message.toUpperCase() : message,
        };
      },
    }),
  )
  .route(
    route({
      method: "GET",
      path: "/users/:id",
      params: z.object({ id: z.string().min(1) }),
      output: z.object({ id: z.string(), name: z.string() }),
      errors: { 404: problemSchema },
      handler: async (_ctx, input) => {
        if (input.params.id === "missing") {
          return err(
            appError(ErrorCodes.NOT_FOUND, { detail: "user missing" }),
          );
        }
        return ok({ id: input.params.id, name: "Ada" });
      },
    }),
  );
```

## Listen

```ts
import { listen, installProcessSignals } from "@zwents/http";
import { app, config } from "./app.js";

const handle = await listen(app, {
  port: config.PORT,
  host: config.HOST,
  drainTimeoutMs: 10_000,
});

installProcessSignals(app, {
  timeoutMs: 10_000,
  fatalErrors: true,
  onFatalError: (error, kind) => console.error(`[fatal] ${kind}`, error),
});

console.log(`listening on http://${handle.host}:${handle.port}`);
```

Try the example in the repo: `examples/minimal`.

## Next

- [App & middleware](/guide/app)
- [Routes & Zod](/guide/routing)
- [Errors](/guide/errors)
