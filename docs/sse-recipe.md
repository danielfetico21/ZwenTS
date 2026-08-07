# Server-Sent Events (SSE)

```ts
import { sseResponse } from "@zwents/http";

app.route(
  route({
    method: "GET",
    path: "/events",
    security: false,
    handler: async (ctx) => {
      ctx.respond(
        sseResponse(
          (async function* () {
            yield { event: "hello", data: "world" };
            yield { data: JSON.stringify({ t: Date.now() }) };
          })(),
        ),
      );
    },
  }),
);
```

Use `ctx.respond` so the stream is not JSON-encoded.

Client disconnect cancels the stream and calls `AsyncIterator.return()` so
generators can stop between yields. Do not put CR/LF/NUL in `event` / `id`
(rejected); `data` line endings are normalized.

**WebSocket:** not shipped in `@zwents/http`. Run a WS library alongside your process (or terminate WS at the reverse proxy) and keep ZwenTS for HTTP/SSE.
