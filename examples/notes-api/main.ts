import { installProcessSignals, listen } from "@zwents/http";
import { app, config } from "./app.js";

const handle = await listen(app, {
  port: config.PORT,
  host: config.HOST,
  drainTimeoutMs: 10_000,
});

console.log(`notes-api listening on http://${handle.host}:${handle.port}`);
console.log("Try:");
console.log(
  `  curl -s -X POST http://${handle.host}:${handle.port}/auth/token -H 'content-type: application/json' -d '{"userId":"ada"}'`,
);

installProcessSignals(app, {
  timeoutMs: 10_000,
  fatalErrors: true,
  onFatalError: (error, kind) => {
    console.error(`[fatal] ${kind}`, error);
  },
});
