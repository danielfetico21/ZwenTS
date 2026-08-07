import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bearerAuth, requireAuth } from "@zwents/auth";
import { loadConfig } from "@zwents/config";
import { appError, createApp, ErrorCodes } from "@zwents/core";
import { createRoute, problemSchema } from "@zwents/schema";
import { cors, requestId, securityHeaders } from "@zwents/security";
import { z } from "zod";
import { buildContainer, type AppServices } from "./lib/container.js";

const api = createRoute<AppServices>();

const here = dirname(fileURLToPath(import.meta.url));
/** Dist layout: public/ is copied next to dist, or we read from source ../public */
function loadUiHtml(): string {
  const candidates = [
    join(here, "public", "index.html"),
    join(here, "..", "public", "index.html"),
  ];
  for (const path of candidates) {
    try {
      return readFileSync(path, "utf8");
    } catch {
      // try next
    }
  }
  return `<!doctype html><html><body><p>UI missing — add public/index.html</p></body></html>`;
}

export const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3040),
  HOST: z.string().default("127.0.0.1"),
});

export const config = loadConfig(ConfigSchema);

const Project = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  createdAt: z.number().int(),
});

const TimeEntry = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  description: z.string(),
  startedAt: z.number().int(),
  stoppedAt: z.number().int().nullable(),
  durationMs: z.number().int(),
  running: z.boolean(),
});

export function createTimeTrackingApp(
  services: AppServices = buildContainer(),
) {
  const uiHtml = loadUiHtml();

  const app = createApp({
    context: services,
    onStop: [() => services.db.close()],
  })
    .use(requestId())
    .use(
      securityHeaders({
        strictTransportSecurity: false,
      }),
    )
    .use(
      cors({
        // Same-origin UI + explicit local allowlist (not reflect-all)
        origin: [
          `http://${config.HOST}:${config.PORT}`,
          "http://127.0.0.1:3040",
          "http://localhost:3040",
        ],
        credentials: true,
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
    api({
      method: "GET",
      path: "/",
      tags: ["ui"],
      security: false,
      handler: async (ctx) => {
        ctx.respond({
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
          body: uiHtml,
        });
      },
    }),
  );

  app.route(
    api({
      method: "POST",
      path: "/auth/token",
      tags: ["auth"],
      security: false,
      body: z.object({
        userId: z.string().min(1).max(64),
      }),
      output: z.object({ token: z.string(), userId: z.string() }),
      errors: { 400: problemSchema, 403: problemSchema },
      handler: async (ctx, input) => {
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
    api({
      method: "GET",
      path: "/me",
      tags: ["auth"],
      middleware: [requireAuth()],
      output: z.object({ userId: z.string() }),
      errors: { 401: problemSchema },
      handler: async (ctx) => ({ userId: ctx.auth!.userId }),
    }),
  );

  app.route(
    api({
      method: "GET",
      path: "/projects",
      tags: ["projects"],
      middleware: [requireAuth()],
      output: z.object({ items: z.array(Project) }),
      errors: { 401: problemSchema },
      handler: async (ctx) => ({
        items: await ctx.services.projects.list(ctx.auth!.userId),
      }),
    }),
  );

  app.route(
    api({
      method: "POST",
      path: "/projects",
      tags: ["projects"],
      middleware: [requireAuth()],
      body: z.object({
        name: z.string().min(1).max(120),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional(),
      }),
      output: Project,
      errors: { 401: problemSchema, 400: problemSchema },
      handler: async (ctx, input) =>
        ctx.services.projects.create(ctx.auth!.userId, input.body),
    }),
  );

  app.route(
    api({
      method: "PATCH",
      path: "/projects/:id",
      tags: ["projects"],
      middleware: [requireAuth()],
      params: z.object({ id: z.string().uuid() }),
      body: z.object({
        name: z.string().min(1).max(120).optional(),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional(),
      }),
      output: Project,
      errors: { 401: problemSchema, 404: problemSchema },
      handler: async (ctx, input) =>
        ctx.services.projects.update(
          ctx.auth!.userId,
          input.params.id,
          input.body,
        ),
    }),
  );

  app.route(
    api({
      method: "DELETE",
      path: "/projects/:id",
      tags: ["projects"],
      middleware: [requireAuth()],
      params: z.object({ id: z.string().uuid() }),
      output: z.object({ deleted: z.literal(true) }),
      errors: { 401: problemSchema, 404: problemSchema },
      handler: async (ctx, input) =>
        ctx.services.projects.remove(ctx.auth!.userId, input.params.id),
    }),
  );

  app.route(
    api({
      method: "GET",
      path: "/entries",
      tags: ["entries"],
      middleware: [requireAuth()],
      query: z.object({
        from: z.coerce.number().int().optional(),
        to: z.coerce.number().int().optional(),
        projectId: z.string().uuid().optional(),
      }),
      output: z.object({ items: z.array(TimeEntry) }),
      errors: { 401: problemSchema },
      handler: async (ctx, input) => ({
        items: await ctx.services.entries.list(ctx.auth!.userId, input.query),
      }),
    }),
  );

  app.route(
    api({
      method: "GET",
      path: "/entries/running",
      tags: ["entries"],
      middleware: [requireAuth()],
      output: z.object({ entry: TimeEntry.nullable() }),
      errors: { 401: problemSchema },
      handler: async (ctx) => ({
        entry: await ctx.services.entries.running(ctx.auth!.userId),
      }),
    }),
  );

  app.route(
    api({
      method: "POST",
      path: "/entries/start",
      tags: ["entries"],
      middleware: [requireAuth()],
      body: z.object({
        projectId: z.string().uuid().nullable().optional(),
        description: z.string().max(500).optional(),
      }),
      output: TimeEntry,
      errors: {
        401: problemSchema,
        400: problemSchema,
        409: problemSchema,
      },
      handler: async (ctx, input) =>
        ctx.services.entries.start(ctx.auth!.userId, input.body),
    }),
  );

  app.route(
    api({
      method: "POST",
      path: "/entries/stop",
      tags: ["entries"],
      middleware: [requireAuth()],
      body: z
        .object({
          id: z.string().uuid().optional(),
        })
        .optional(),
      output: TimeEntry,
      errors: { 401: problemSchema, 404: problemSchema, 409: problemSchema },
      handler: async (ctx, input) =>
        ctx.services.entries.stop(ctx.auth!.userId, input.body?.id),
    }),
  );

  app.route(
    api({
      method: "POST",
      path: "/entries",
      tags: ["entries"],
      middleware: [requireAuth()],
      body: z.object({
        projectId: z.string().uuid().nullable().optional(),
        description: z.string().max(500).optional(),
        startedAt: z.number().int(),
        stoppedAt: z.number().int(),
      }),
      output: TimeEntry,
      errors: { 401: problemSchema, 400: problemSchema },
      handler: async (ctx, input) =>
        ctx.services.entries.create(ctx.auth!.userId, input.body),
    }),
  );

  app.route(
    api({
      method: "DELETE",
      path: "/entries/:id",
      tags: ["entries"],
      middleware: [requireAuth()],
      params: z.object({ id: z.string().uuid() }),
      output: z.object({ deleted: z.literal(true) }),
      errors: { 401: problemSchema, 404: problemSchema },
      handler: async (ctx, input) =>
        ctx.services.entries.remove(ctx.auth!.userId, input.params.id),
    }),
  );

  return app;
}

export const app = createTimeTrackingApp();
