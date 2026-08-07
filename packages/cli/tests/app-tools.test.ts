import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "@zwents/core";
import { route } from "@zwents/schema";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  checkApp,
  formatRoutes,
  loadAppModule,
  writeClientFile,
  writeOpenApiFile,
} from "../index.js";

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);

describe("cli app tools", () => {
  it("formats routes and detects duplicates", () => {
    const app = createApp({ context: {} })
      .route(
        route({
          method: "GET",
          path: "/a",
          tags: ["a"],
          output: z.object({ ok: z.boolean() }),
          handler: async () => ({ ok: true }),
        }),
      )
      .route({
        method: "GET",
        path: "/a",
        handler: async () => ({ ok: false }),
      });

    expect(formatRoutes(app.routes)).toContain("GET     /a [a]");
    const result = checkApp(app);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/Duplicate route GET \/a/);
  });

  it("formats routes without tags", () => {
    const app = createApp({ context: {} }).route({
      method: "POST",
      path: "/items",
      handler: async () => ({}),
    });
    expect(formatRoutes(app.routes)).toBe("POST    /items");
  });

  it("warns when routes lack output schemas", () => {
    const app = createApp({ context: {} }).route({
      method: "GET",
      path: "/bare",
      handler: async () => ({}),
    });
    const result = checkApp(app);
    expect(result.ok).toBe(true);
    expect(result.warnings[0]).toMatch(/no output schema/);
  });

  it("loads app from named export, default export, or default.app", async () => {
    const named = await loadAppModule(path.join(fixturesDir, "demo-app.mjs"));
    expect(named.routes.length).toBeGreaterThan(0);

    const fromDefault = await loadAppModule(
      path.join(fixturesDir, "default-export.mjs"),
    );
    expect(fromDefault.routes).toHaveLength(1);

    const bad = path.join(fixturesDir, "bad-export.mjs");
    await expect(loadAppModule(bad)).rejects.toThrow(/must export `app`/);
  });

  it("refuses apps outside cwd unless allowUntrusted", async () => {
    const outside = path.join(tmpdir(), "zwen-outside-app.mjs");
    await expect(loadAppModule(outside)).rejects.toThrow(
      /Refusing to import app outside cwd/,
    );
    const err = await loadAppModule(outside, { allowUntrusted: true }).then(
      () => null,
      (error: unknown) => error as Error,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).not.toMatch(/Refusing to import app outside cwd/);
  });

  it("writes OpenAPI and client files to disk", async () => {
    const app = createApp({ context: {} }).route(
      route({
        method: "GET",
        path: "/ping",
        output: z.object({ ok: z.boolean() }),
        handler: async () => ({ ok: true }),
      }),
    );
    const dir = await mkdtemp(path.join(tmpdir(), "zwen-cli-write-"));
    const openapiPath = path.join(dir, "openapi.json");
    const clientPath = path.join(dir, "client.ts");

    await writeOpenApiFile(app, openapiPath, {
      title: "Demo",
      version: "1.0.0",
    });
    await writeClientFile(app, clientPath, {
      title: "Demo",
      version: "1.0.0",
      clientName: "PingClient",
    });

    const openapi = JSON.parse(await readFile(openapiPath, "utf8")) as Record<
      string,
      unknown
    >;
    expect(openapi["info"]).toMatchObject({ title: "Demo", version: "1.0.0" });

    const client = await readFile(clientPath, "utf8");
    expect(client).toContain("export class PingClient");

    const defaultClientPath = path.join(dir, "default-client.ts");
    await writeClientFile(app, defaultClientPath, {
      title: "Demo",
      version: "1.0.0",
    });
    expect(await readFile(defaultClientPath, "utf8")).toContain(
      "export class ApiClient",
    );
  });
});
