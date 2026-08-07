import { listen, installProcessSignals } from "@zwents/http";
import { app, config } from "./app.js";

const handle = await listen(app, {
  port: config.PORT,
  host: config.HOST,
  drainTimeoutMs: 10_000,
});
console.log(`listening on http://${handle.host}:${handle.port}`);

installProcessSignals(app, {
  timeoutMs: 10_000,
  fatalErrors: true,
  onFatalError: (error, kind) => {
    console.error(`[fatal] ${kind}`, error);
  },
});
