import { bearerAuth, requireAuth } from "@zwents/auth";
import { loadConfig } from "@zwents/config";
import { appError, createApp, ErrorCodes } from "@zwents/core";
import { idempotency } from "@zwents/idempotency";
import { rateLimit } from "@zwents/ratelimit";
import {
  createRoute,
  offsetPage,
  offsetPageQuery,
  offsetPageSchema,
  problemSchema,
} from "@zwents/schema";
import { cors, requestId, securityHeaders } from "@zwents/security";
import { z } from "zod";
import { buildContainer, type AppServices } from "./lib/container.js";

const notesRoute = createRoute<AppServices>();

export const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("127.0.0.1"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
});

export const config = loadConfig(ConfigSchema);

const Note = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  createdAt: z.number().int(),
});

export function createNotesApp(services: AppServices = buildContainer()) {
  const app = createApp({
    context: services,
    onStop: [() => services.db.close()],
  })
    .use(requestId())
    .use(
      securityHeaders({
        // Example runs on http:// locally
        strictTransportSecurity: false,
      }),
    )
    .use(
      cors({
        origin: [config.CORS_ORIGIN],
        credentials: true,
      }),
    )
    .use(
      rateLimit({
        limit: 100,
        windowMs: 60_000,
      }),
    )
    .use(
      bearerAuth({
        required: false,
        verify: async (token, ctx) => {
          const svc = ctx.services as AppServices;
          const userId = await svc.tokens.resolveUserId(token);
          if (!userId) return null;
          return { userId, roles: ["user"] };
        },
      }),
    );

  app.route(
    notesRoute({
      method: "GET",
      path: "/health",
      tags: ["ops"],
      security: false,
      output: z.object({ status: z.literal("ok") }),
      handler: async () => ({ status: "ok" as const }),
    }),
  );

  app.route(
    notesRoute({
      method: "GET",
      path: "/ready",
      tags: ["ops"],
      security: false,
      output: z.object({
        status: z.enum(["ready", "not_ready"]),
        checks: z.record(z.string(), z.boolean()),
      }),
      errors: { 503: problemSchema },
      handler: async (ctx) => {
        const dbOk = await ctx.services.db.ping();
        if (!dbOk) {
          throw appError(ErrorCodes.SERVICE_UNAVAILABLE, {
            detail: "database not ready",
            extras: { checks: { db: false } },
          });
        }
        return { status: "ready" as const, checks: { db: true } };
      },
    }),
  );

  app.route(
    notesRoute({
      method: "POST",
      path: "/auth/token",
      tags: ["auth"],
      body: z.object({
        userId: z.string().min(1).max(64),
      }),
      output: z.object({ token: z.string() }),
      errors: { 400: problemSchema, 403: problemSchema },
      handler: async (ctx, input) => {
        // Demo-only minting — never enable in production without a real IdP.
        if (process.env["ALLOW_DEMO_AUTH"] !== "1") {
          throw appError(ErrorCodes.FORBIDDEN, {
            detail:
              "Demo token minting disabled; set ALLOW_DEMO_AUTH=1 for local demos",
          });
        }
        return ctx.services.tokens.issue(input.body.userId);
      },
    }),
  );

  app.route(
    notesRoute({
      method: "GET",
      path: "/notes",
      tags: ["notes"],
      middleware: [requireAuth()],
      query: offsetPageQuery({ defaultLimit: 10, maxLimit: 50 }),
      output: offsetPageSchema(Note),
      errors: { 401: problemSchema },
      handler: async (ctx, input) => {
        const userId = ctx.auth!.userId;
        const { items, total } = await ctx.services.notes.list(
          userId,
          input.query,
        );
        return offsetPage({
          items,
          limit: input.query.limit,
          offset: input.query.offset,
          total,
        });
      },
    }),
  );

  app.route(
    notesRoute({
      method: "POST",
      path: "/notes",
      tags: ["notes"],
      middleware: [requireAuth(), idempotency()],
      body: z.object({
        title: z.string().min(1).max(200),
        body: z.string().max(10_000).default(""),
      }),
      output: Note,
      errors: { 401: problemSchema, 409: problemSchema },
      handler: async (ctx, input) => {
        const result = await ctx.services.notes.create(
          ctx.auth!.userId,
          input.body,
        );
        return result;
      },
    }),
  );

  app.route(
    notesRoute({
      method: "GET",
      path: "/notes/:id",
      tags: ["notes"],
      middleware: [requireAuth()],
      params: z.object({ id: z.string().uuid() }),
      output: Note,
      errors: { 401: problemSchema, 404: problemSchema },
      handler: async (ctx, input) =>
        ctx.services.notes.get(ctx.auth!.userId, input.params.id),
    }),
  );

  app.route(
    notesRoute({
      method: "DELETE",
      path: "/notes/:id",
      tags: ["notes"],
      middleware: [requireAuth()],
      params: z.object({ id: z.string().uuid() }),
      output: z.object({ deleted: z.literal(true) }),
      errors: { 401: problemSchema, 404: problemSchema },
      handler: async (ctx, input) =>
        ctx.services.notes.remove(ctx.auth!.userId, input.params.id),
    }),
  );

  return app;
}

/** Default app instance for `main` / OpenAPI tooling. */
export const app = createNotesApp();
