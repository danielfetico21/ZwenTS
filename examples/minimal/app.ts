import {
  ErrorCodes,
  appError,
  createApp,
  err,
  ok,
} from "@zwents/core";
import { loadConfig } from "@zwents/config";
import { problemSchema, route } from "@zwents/schema";
import { z } from "zod";

export const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("127.0.0.1"),
});

export const config = loadConfig(ConfigSchema);

export const app = createApp({
  context: {
    hello: () => "zwents",
  },
}).route(
  route({
    method: "GET",
    path: "/hello",
    tags: ["demo"],
    query: z.object({
      shout: z.enum(["true", "false"]).optional(),
    }),
    output: z.object({
      message: z.string(),
    }),
    errors: {
      400: problemSchema,
    },
    handler: async (ctx, input) => {
      const message = ctx.services.hello();
      return {
        message:
          input.query?.shout === "true" ? message.toUpperCase() : message,
      };
    },
  }),
).route(
  route({
    method: "GET",
    path: "/users/:id",
    tags: ["demo"],
    params: z.object({ id: z.string().min(1) }),
    output: z.object({ id: z.string(), name: z.string() }),
    errors: {
      404: problemSchema,
    },
    handler: async (_ctx, input) => {
      if (input.params.id === "missing") {
        return err(
          appError(ErrorCodes.NOT_FOUND, { detail: "user missing" }),
        );
      }
      return ok({ id: input.params.id, name: "Ada" });
    },
  }),
);
