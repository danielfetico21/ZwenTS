import { createApp } from "@zwents/core";

const app = createApp({ context: {} }).route({
  method: "GET",
  path: "/",
  handler: async () => ({ ok: true }),
});

export default { app };
