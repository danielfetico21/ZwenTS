# Server-Sent Events

```ts
import { sseResponse } from "@zwents/http";

handler: async (ctx) => {
  ctx.respond(
    sseResponse(
      (async function* () {
        yield { event: "tick", data: String(Date.now()) };
      })(),
    ),
  );
};
```

Client disconnect cancels the stream (`AsyncIterator.return()`). Do not put CR/LF in `event`/`id`.

WebSocket is not built into ZwenTS — use a dedicated library beside HTTP.

More: monorepo `docs/sse-recipe.md`.
