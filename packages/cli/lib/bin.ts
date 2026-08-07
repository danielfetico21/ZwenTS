#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import {
  checkApp,
  formatRoutes,
  loadAppModule,
  writeClientFile,
  writeOpenApiFile,
} from "./app-tools.js";
import { generateWireContainer } from "./wire/generate.js";

export class CliUsageError extends Error {
  override readonly name = "CliUsageError";
}

function usage(): never {
  console.error(`Usage:
  zwen routes   --app <module> [--allow-untrusted]
  zwen openapi  --app <module> --out <file> [--title <t>] [--version <v>] [--allow-untrusted]
  zwen client   --app <module> --out <file> [--title <t>] [--version <v>] [--name <Client>] [--allow-untrusted]
  zwen check    --app <module> [--allow-untrusted]
  zwen gen:wire --from <wire.ts> --out <container.gen.ts>

  --app is imported and executed. Paths outside the current working directory
  are refused unless --allow-untrusted is set.
`);
  throw new CliUsageError();
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  return args[i + 1];
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

export async function runCli(argv: string[]): Promise<void> {
  const [command, ...args] = argv;
  if (!command) usage();

  if (command === "gen:wire") {
    const from = flag(args, "--from");
    const out = flag(args, "--out") ?? "container.gen.ts";
    if (!from) {
      console.error("Missing --from <wire.ts>");
      usage();
    }
    const result = await generateWireContainer({ from, out });
    console.log(`Wrote ${result.out}`);
    return;
  }

  const appPath = flag(args, "--app");
  if (!appPath) {
    console.error("Missing --app <module>");
    usage();
  }

  const app = await loadAppModule(appPath, {
    allowUntrusted: hasFlag(args, "--allow-untrusted"),
  });

  switch (command) {
    case "routes": {
      console.log(formatRoutes(app.routes) || "(no routes)");
      return;
    }
    case "openapi": {
      const out = flag(args, "--out") ?? "openapi.json";
      const title = flag(args, "--title") ?? "API";
      const version = flag(args, "--version") ?? "0.0.0";
      await writeOpenApiFile(app, out, { title, version });
      console.log(`Wrote ${out}`);
      return;
    }
    case "client": {
      const out = flag(args, "--out") ?? "api-client.ts";
      const title = flag(args, "--title") ?? "API";
      const version = flag(args, "--version") ?? "0.0.0";
      const clientName = flag(args, "--name") ?? "ApiClient";
      await writeClientFile(app, out, { title, version, clientName });
      console.log(`Wrote ${out}`);
      return;
    }
    case "check": {
      const result = checkApp(app);
      for (const warning of result.warnings) {
        console.warn(`warning: ${warning}`);
      }
      for (const error of result.errors) {
        console.error(`error: ${error}`);
      }
      if (!result.ok) {
        process.exitCode = 1;
        return;
      }
      console.log(`ok: ${app.routes.length} route(s)`);
      return;
    }
    default:
      console.error(`Unknown command: ${command}`);
      usage();
  }
}

const isMain =
  typeof process.argv[1] === "string" &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

/* v8 ignore start -- CLI process entry; covered by subprocess smoke tests */
if (isMain) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    if (error instanceof CliUsageError) {
      process.exitCode = 1;
      return;
    }
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
