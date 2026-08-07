import { installProcessSignals, listen } from "@zwents/http";
import { app, config } from "./app.js";

const handle = await listen(app, {
  port: config.PORT,
  host: config.HOST,
  drainTimeoutMs: 10_000,
});

const base = `http://${handle.host}:${handle.port}`;
console.log(`time-tracking listening on ${base}`);
console.log(`UI:  ${base}/`);
console.log(`API: POST ${base}/auth/token  (ALLOW_DEMO_AUTH=1)`);

installProcessSignals(app, {
  timeoutMs: 10_000,
  fatalErrors: true,
  onFatalError: (error, kind) => {
    console.error(`[fatal] ${kind}`, error);
  },
});
