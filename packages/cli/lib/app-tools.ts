import type { App, RouteDefinition } from "@zwents/core";
import {
  generateFetchClient,
  generateOpenApi,
  stringifyOpenApi,
} from "@zwents/openapi";
import { pathToFileURL } from "node:url";
import { isAbsolute, relative, resolve } from "node:path";
import { writeFile } from "node:fs/promises";

export type LoadedApp = App<unknown>;

export type LoadAppModuleOptions = {
  /**
   * Allow importing modules outside `process.cwd()`.
   * Defaults to false — `zwen` executes the module.
   */
  allowUntrusted?: boolean;
  cwd?: string;
};

export async function loadAppModule(
  specifier: string,
  options: LoadAppModuleOptions = {},
): Promise<LoadedApp> {
  const cwd = options.cwd ?? process.cwd();
  const abs = resolve(cwd, specifier);
  if (!options.allowUntrusted) {
    const rel = relative(cwd, abs);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      throw new Error(
        `Refusing to import app outside cwd (${cwd}): ${specifier}. Pass --allow-untrusted to override.`,
      );
    }
  }
  const href = pathToFileURL(abs).href;
  const mod = (await import(href)) as Record<string, unknown>;
  const candidate =
    mod["app"] ??
    (mod["default"] as Record<string, unknown> | undefined)?.["app"] ??
    mod["default"];

  if (
    !candidate ||
    typeof candidate !== "object" ||
    !("routes" in candidate) ||
    !("dispatch" in candidate)
  ) {
    throw new Error(
      `Module ${specifier} must export \`app\` (or default.app) — a ZwenTS App instance`,
    );
  }

  return candidate as LoadedApp;
}

export function formatRoutes(routes: readonly RouteDefinition[]): string {
  return routes
    .map((route) => {
      const tags = route.meta?.tags?.length
        ? ` [${route.meta.tags.join(", ")}]`
        : "";
      return `${route.method.padEnd(7)} ${route.path}${tags}`;
    })
    .join("\n");
}

export type CheckResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export function checkApp(app: LoadedApp): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Map<string, number>();

  for (const [index, route] of app.routes.entries()) {
    const key = `${route.method} ${route.path}`;
    const prev = seen.get(key);
    if (prev !== undefined) {
      errors.push(`Duplicate route ${key} (indexes ${prev} and ${index})`);
    } else {
      seen.set(key, index);
    }

    if (!route.meta?.schemas?.output) {
      warnings.push(
        `${key} has no output schema (OpenAPI response will be empty)`,
      );
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

export async function writeOpenApiFile(
  app: LoadedApp,
  outPath: string,
  info: { title: string; version: string },
): Promise<void> {
  const doc = generateOpenApi(app, { info });
  await writeFile(outPath, stringifyOpenApi(doc), "utf8");
}

export async function writeClientFile(
  app: LoadedApp,
  outPath: string,
  info: { title: string; version: string; clientName?: string },
): Promise<void> {
  const doc = generateOpenApi(app, {
    info: { title: info.title, version: info.version },
  });
  const source = generateFetchClient(doc, {
    clientName: info.clientName ?? "ApiClient",
  });
  await writeFile(outPath, source, "utf8");
}
