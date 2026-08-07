# Routes & Zod

`@zwents/schema` `route()` builds a core `RouteDefinition` with validation and OpenAPI metadata.

## Basic route

```ts
import { route } from "@zwents/schema";
import { z } from "zod";

app.route(
  route({
    method: "POST",
    path: "/notes",
    body: z.object({ title: z.string(), body: z.string() }),
    output: z.object({ id: z.string(), title: z.string() }),
    handler: async (ctx, input) => {
      // input.body is typed
      return ctx.services.notes.create(input.body);
    },
  }),
);
```

`app.route` registers; `route()` validates. The double name is intentional (RFC 0003).

## Pin services with `createRoute`

```ts
import { createRoute } from "@zwents/schema";

type AppServices = { notes: NotesService };
const notesRoute = createRoute<AppServices>();

app.route(
  notesRoute({
    method: "GET",
    path: "/notes/:id",
    params: z.object({ id: z.string() }),
    output: Note,
    handler: async (ctx, input) => {
      // ctx.services is AppServices
      return ctx.services.notes.get(input.params.id);
    },
  }),
);
```

## Documented errors

```ts
import { problemSchema } from "@zwents/schema";

errors: {
  404: problemSchema,
  401: problemSchema,
}
```

`problemSchema` mirrors RFC 0004 Problem Details for OpenAPI `components.schemas.Problem`.

## OpenAPI & client

```bash
pnpm zwen openapi --app dist/app.js --out openapi.json --title MyApi --version 0.0.0
pnpm zwen client --app dist/app.js --out api-client.ts --name MyClient
```

Generated clients throw bare `Error` on `!res.ok` (MVP) — see [What APIs throw](/reference/throws).
