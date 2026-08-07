import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CliUsageError, runCli } from "../index.js";

const execFileAsync = promisify(execFile);

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);
const demoApp = path.join(fixturesDir, "demo-app.mjs");

describe("runCli", () => {
  const logs: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  afterEach(() => {
    logs.length = 0;
    warnings.length = 0;
    errors.length = 0;
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  function captureConsole(): void {
    vi.spyOn(console, "log").mockImplementation((msg) => {
      logs.push(String(msg));
    });
    vi.spyOn(console, "warn").mockImplementation((msg) => {
      warnings.push(String(msg));
    });
    vi.spyOn(console, "error").mockImplementation((msg) => {
      errors.push(String(msg));
    });
  }

  it("prints usage when command is missing", async () => {
    captureConsole();
    await expect(runCli([])).rejects.toBeInstanceOf(CliUsageError);
    expect(errors.join("\n")).toContain("Usage:");
  });

  it("rejects unknown commands", async () => {
    captureConsole();
    await expect(runCli(["nope", "--app", demoApp])).rejects.toBeInstanceOf(
      CliUsageError,
    );
    expect(errors.some((line) => line.includes("Unknown command: nope"))).toBe(
      true,
    );
  });

  it("requires --app for app commands", async () => {
    captureConsole();
    await expect(runCli(["routes"])).rejects.toBeInstanceOf(CliUsageError);
    expect(errors.some((line) => line.includes("Missing --app"))).toBe(true);
  });

  it("lists routes for a loaded app module", async () => {
    captureConsole();
    await runCli(["routes", "--app", demoApp]);
    expect(logs.join("\n")).toContain("GET     /hi [demo]");
    expect(logs.join("\n")).toContain("GET     /warn");
  });

  it("prints (no routes) when the app has none", async () => {
    captureConsole();
    await runCli(["routes", "--app", path.join(fixturesDir, "empty-app.mjs")]);
    expect(logs.join("\n")).toContain("(no routes)");
  });

  it("writes openapi output with defaults", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "zwen-cli-openapi-"));
    const out = path.join(dir, "openapi.json");
    captureConsole();
    await runCli(["openapi", "--app", demoApp, "--out", out]);
    const doc = JSON.parse(await readFile(out, "utf8")) as Record<
      string,
      unknown
    >;
    expect(doc["openapi"]).toBe("3.1.0");
    expect(logs.join("\n")).toContain(`Wrote ${out}`);
  });

  it("writes client output with a custom name", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "zwen-cli-client-"));
    const out = path.join(dir, "client.ts");
    captureConsole();
    await runCli([
      "client",
      "--app",
      demoApp,
      "--out",
      out,
      "--name",
      "DemoClient",
    ]);
    const source = await readFile(out, "utf8");
    expect(source).toContain("export class DemoClient");
    expect(logs.join("\n")).toContain(`Wrote ${out}`);
  });

  it("warns on check and exits with code 1 when duplicates exist", async () => {
    captureConsole();
    await runCli(["check", "--app", path.join(fixturesDir, "dup-app.mjs")]);
    expect(process.exitCode).toBe(1);
    expect(errors.some((line) => line.includes("error:"))).toBe(true);
  });

  it("reports ok on check for a valid app", async () => {
    captureConsole();
    await runCli(["check", "--app", demoApp]);
    expect(process.exitCode).toBeUndefined();
    expect(logs.join("\n")).toMatch(/ok: \d+ route\(s\)/);
    expect(warnings.some((line) => line.includes("warning:"))).toBe(true);
  });

  it("generates wire containers via gen:wire", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "zwen-cli-wire-"));
    const from = path.join(fixturesDir, "sample-wire.ts");
    const out = path.join(dir, "container.gen.ts");
    captureConsole();
    await runCli(["gen:wire", "--from", from, "--out", out]);
    const source = await readFile(out, "utf8");
    expect(source).toContain("buildContainer");
    expect(logs.join("\n")).toContain(`Wrote ${out}`);
  });

  it("requires --from for gen:wire", async () => {
    captureConsole();
    await expect(runCli(["gen:wire"])).rejects.toBeInstanceOf(CliUsageError);
    expect(errors.some((line) => line.includes("Missing --from"))).toBe(true);
  });

  it("executes the built bin entrypoint as a subprocess", async () => {
    const binPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../dist/lib/bin.js",
    );
    const { stdout } = await execFileAsync(
      process.execPath,
      ["--experimental-specifier-resolution=node", binPath, "routes", "--app", demoApp],
      { cwd: path.join(path.dirname(fileURLToPath(import.meta.url)), "..") },
    );
    expect(stdout).toContain("GET     /hi [demo]");
  });
});
