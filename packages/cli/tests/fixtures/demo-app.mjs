import { createApp } from "@zwents/core";
import { route } from "@zwents/schema";
import { z } from "zod";

export const app = createApp({ context: {} })
  .route(
    route({
      method: "GET",
      path: "/hi",
      tags: ["demo"],
      output: z.object({ ok: z.boolean() }),
      handler: async () => ({ ok: true }),
    }),
  )
  .route({
    method: "GET",
    path: "/warn",
    handler: async () => ({ ok: true }),
  });
