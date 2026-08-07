# Access log

```ts
import { accessLog, requestId } from "@zwents/security";

app
  .use(requestId())
  .use(
    accessLog({
      skip: (ctx) => ctx.req.path === "/health",
    }),
  );
```

Logs `method`, `path`, `status`, `durationMs`, `requestId` via `ctx.logger.info` (or a custom `log` sink).
