import { createApp } from "@zwents/core";

export const app = createApp({ context: {} })
  .route({ method: "GET", path: "/x", handler: async () => ({}) })
  .route({ method: "GET", path: "/x", handler: async () => ({}) });
