import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  WireCodegenError,
  emitWireContainer,
  generateWireContainer,
  parseWireSource,
  topoSortProviders,
  wire,
  defineWire,
} from "../index.js";

const createDb = () => ({});
const createDbWithConfig = (_config: unknown) => ({});
const createUsers = (_db: unknown) => ({});

describe("defineWire / wire", () => {
  it("accepts flat wire bindings", () => {
    const def = defineWire({
      db: wire(createDb),
      users: wire(createUsers, ["db"]),
    });
    expect(Object.keys(def.providers)).toEqual(["db", "users"]);
    expect(def.providers.users?.deps).toEqual(["db"]);
  });

  it("accepts full form with seeds and expose", () => {
    const def = defineWire({
      providers: {
        db: wire(createDbWithConfig, ["config"]),
      },
      seeds: ["config"],
      expose: ["db"],
      functionName: "makeApp",
    });
    expect(def.seeds).toEqual(["config"]);
    expect(def.functionName).toBe("makeApp");
  });

  it("rejects full form without providers map", () => {
    expect(() =>
      defineWire({ seeds: ["config"] } as never),
    ).toThrow(/expected providers map/);
  });
});

describe("wire codegen", () => {
  it("topo-sorts providers and emits buildContainer", () => {
    const source = `
import { defineWire, wire } from "@zwents/cli/wire";
import { createDb } from "./db.js";
import { createUsers } from "./users.js";

export default defineWire({
  users: wire(createUsers, ["db"]),
  db: wire(createDb),
});
`;
    const graph = parseWireSource(source, "/app/src/wire.ts");
    const ordered = topoSortProviders(graph.providers, graph.seeds);
    expect(ordered.map((p) => p.key)).toEqual(["db", "users"]);

    const out = emitWireContainer(graph, "/app/src/container.gen.ts");
    expect(out).toContain('import { createDb } from "./db.js";');
    expect(out).toContain('import { createUsers } from "./users.js";');
    expect(out).toContain("const db = createDb();");
    expect(out).toContain("const users = createUsers(db);");
    expect(out).toContain("return { db, users } as const;");
  });

  it("supports seeds, expose, and rewritten relative imports", () => {
    const source = `
import { defineWire, wire } from "@zwents/cli/wire";
import { createDb } from "./infra/db.js";
import { createUsers } from "./users/service.js";

export default defineWire({
  providers: {
    db: wire(createDb, ["config"]),
    users: wire(createUsers, ["db"]),
  },
  seeds: ["config"],
  expose: ["users"],
  functionName: "buildContainer",
});
`;
    const graph = parseWireSource(source, "/app/src/wire.ts");
    const out = emitWireContainer(graph, "/app/generated/container.gen.ts");
    expect(out).toContain("export function buildContainer(config: unknown)");
    expect(out).toContain("const db = createDb(config);");
    expect(out).toContain('import { createDb } from "../src/infra/db.js";');
    expect(out).toContain("return { users } as const;");
  });

  it("rejects missing bindings", () => {
    const source = `
import { defineWire, wire } from "@zwents/cli/wire";
import { createUsers } from "./users.js";
export default defineWire({
  users: wire(createUsers, ["db"]),
});
`;
    const graph = parseWireSource(source, "/app/wire.ts");
    expect(() => topoSortProviders(graph.providers, [])).toThrow(WireCodegenError);
    expect(() => topoSortProviders(graph.providers, [])).toThrow(/Missing binding "db"/);
  });

  it("rejects circular dependencies", () => {
    const source = `
import { defineWire, wire } from "@zwents/cli/wire";
import { createA } from "./a.js";
import { createB } from "./b.js";
export default defineWire({
  a: wire(createA, ["b"]),
  b: wire(createB, ["a"]),
});
`;
    const graph = parseWireSource(source, "/app/wire.ts");
    expect(() => topoSortProviders(graph.providers, [])).toThrow(/Circular dependency/);
  });

  it("reports cycles even when providers also depend on seeds", () => {
    expect(() =>
      topoSortProviders(
        [
          { key: "a", factoryName: "createA", deps: ["b", "config"], line: 1 },
          { key: "b", factoryName: "createB", deps: ["a", "config"], line: 2 },
        ],
        ["config"],
      ),
    ).toThrow(/Circular dependency/);
  });

  it("rejects non-wire provider entries", () => {
    const source = `
import { defineWire } from "@zwents/cli/wire";
import { createDb } from "./db.js";
export default defineWire({
  db: createDb,
});
`;
    expect(() => parseWireSource(source, "/app/wire.ts")).toThrow(/must be wire\(/);
  });

  it("writes a file via generateWireContainer", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "zwents-wire-"));
    const wirePath = path.join(dir, "wire.ts");
    const outPath = path.join(dir, "container.gen.ts");
    await writeFile(
      wirePath,
      `
import { defineWire, wire } from "@zwents/cli/wire";
import { createDb } from "./db.js";
export default defineWire({
  db: wire(createDb),
});
`,
      "utf8",
    );

    const result = await generateWireContainer({ from: wirePath, out: outPath });
    const text = await readFile(result.out, "utf8");
    expect(text).toContain("export function buildContainer()");
    expect(text).toContain("const db = createDb();");
  });

  it("rejects missing defineWire call", () => {
    expect(() => parseWireSource("export const x = 1;", "/app/wire.ts")).toThrow(
      /no defineWire/,
    );
  });

  it("rejects defineWire without object literal", () => {
    expect(() =>
      parseWireSource(
        `
import { defineWire } from "@zwents/cli/wire";
const opts = {};
export default defineWire(opts);
`,
        "/app/wire.ts",
      ),
    ).toThrow(/object literal/);
  });

  it("rejects unimported factory identifiers", () => {
    expect(() =>
      parseWireSource(
        `
import { defineWire, wire } from "@zwents/cli/wire";
export default defineWire({
  db: wire(createDb),
});
`,
        "/app/wire.ts",
      ),
    ).toThrow(/must be imported/);
  });

  it("rejects unknown expose keys", () => {
    const graph = parseWireSource(
      `
import { defineWire, wire } from "@zwents/cli/wire";
import { createDb } from "./db.js";
export default defineWire({
  providers: { db: wire(createDb) },
  expose: ["missing"],
});
`,
      "/app/wire.ts",
    );
    expect(() => emitWireContainer(graph, "/app/out.ts")).toThrow(
      /expose contains unknown key/,
    );
  });

  it("rejects non-object providers and bad functionName", () => {
    expect(() =>
      parseWireSource(
        `
import { defineWire, wire } from "@zwents/cli/wire";
export default defineWire({
  providers: [] as any,
});
`,
        "/app/wire.ts",
      ),
    ).toThrow(/providers must be an object literal/);

    expect(() =>
      parseWireSource(
        `
import { defineWire, wire } from "@zwents/cli/wire";
import { createDb } from "./db.js";
export default defineWire({
  providers: { db: wire(createDb) },
  functionName: 1 as any,
});
`,
        "/app/wire.ts",
      ),
    ).toThrow(/functionName must be a string literal/);
  });

  it("rejects unsafe identifiers in functionName and provider keys", () => {
    expect(() =>
      parseWireSource(
        `
import { defineWire, wire } from "@zwents/cli/wire";
import { createDb } from "./db.js";
export default defineWire({
  providers: { db: wire(createDb) },
  functionName: "build(); console.log(1); function x",
});
`,
        "/app/wire.ts",
      ),
    ).toThrow(/functionName .* must be a valid TypeScript identifier/);

    expect(() =>
      parseWireSource(
        `
import { defineWire, wire } from "@zwents/cli/wire";
import { createDb } from "./db.js";
export default defineWire({
  providers: { "foo-bar": wire(createDb) },
});
`,
        "/app/wire.ts",
      ),
    ).toThrow(/provider key .* must be a valid TypeScript identifier/);
  });

  it("rejects empty providers, duplicates, and seed conflicts", () => {
    expect(() =>
      parseWireSource(
        `
import { defineWire } from "@zwents/cli/wire";
export default defineWire({
  providers: {},
});
`,
        "/app/wire.ts",
      ),
    ).toThrow(/providers map is empty/);

    expect(() =>
      parseWireSource(
        `
import { defineWire, wire } from "@zwents/cli/wire";
import { createDb } from "./db.js";
export default defineWire({
  db: wire(createDb),
  "db": wire(createDb),
});
`,
        "/app/wire.ts",
      ),
    ).toThrow(/duplicate provider key/);

    expect(() =>
      parseWireSource(
        `
import { defineWire, wire } from "@zwents/cli/wire";
import { createDb } from "./db.js";
export default defineWire({
  providers: { config: wire(createDb) },
  seeds: ["config"],
});
`,
        "/app/wire.ts",
      ),
    ).toThrow(/seed "config" conflicts/);
  });

  it("rejects flat option keys and non-identifier wire args", () => {
    expect(() =>
      parseWireSource(
        `
import { defineWire, wire } from "@zwents/cli/wire";
import { createDb } from "./db.js";
export default defineWire({
  db: wire(createDb),
  seeds: ["config"],
});
`,
        "/app/wire.ts",
      ),
    ).toThrow(/use defineWire\(\{ providers/);

    expect(() =>
      parseWireSource(
        `
import { defineWire, wire } from "@zwents/cli/wire";
export default defineWire({
  db: wire(() => ({})),
});
`,
        "/app/wire.ts",
      ),
    ).toThrow(/factory identifier/);

    expect(() =>
      parseWireSource(
        `
import { defineWire } from "@zwents/cli/wire";
import { createDb } from "./db.js";
export default defineWire({
  db: other(createDb),
});
`,
        "/app/wire.ts",
      ),
    ).toThrow(/must be wire\(/);
  });

  it("rejects invalid deps arrays and supports as const / template deps", () => {
    expect(() =>
      parseWireSource(
        `
import { defineWire, wire } from "@zwents/cli/wire";
import { createDb } from "./db.js";
export default defineWire({
  providers: {
    db: wire(createDb, "db" as any),
  },
});
`,
        "/app/wire.ts",
      ),
    ).toThrow(/array of string literals/);

    expect(() =>
      parseWireSource(
        `
import { defineWire, wire } from "@zwents/cli/wire";
import { createUsers } from "./users.js";
import { createDb } from "./db.js";
export default defineWire({
  db: wire(createDb),
  users: wire(createUsers, [db]),
});
`,
        "/app/wire.ts",
      ),
    ).toThrow(/string literals/);

    const graph = parseWireSource(
      `
import { defineWire, wire } from "@zwents/cli/wire";
import { createDb } from "./db.js";
import { createUsers } from "./users.js";
export default defineWire({
  providers: {
    db: wire(createDb),
    users: wire(createUsers, ["db"] as const),
  },
  expose: [\`db\`, "users"],
});
`,
      "/app/wire.ts",
    );
    expect(graph.providers.find((p) => p.key === "users")?.deps).toEqual(["db"]);
  });

  it("emits default imports and renamed named imports", () => {
    const graph = parseWireSource(
      `
import { defineWire, wire } from "@zwents/cli/wire";
import createDb from "./db.js";
import { createUserService as createUsers } from "./users.js";
export default defineWire({
  db: wire(createDb),
  users: wire(createUsers, ["db"]),
});
`,
      "/app/src/wire.ts",
    );
    const out = emitWireContainer(graph, "/app/src/container.gen.ts");
    expect(out).toContain('import createDb from "./db.js";');
    expect(out).toContain(
      'import { createUserService as createUsers } from "./users.js";',
    );
  });

  it("sorts multiple named imports from the same module", () => {
    const graph = parseWireSource(
      `
import { defineWire, wire } from "@zwents/cli/wire";
import { createUsers, createDb } from "./infra.js";
export default defineWire({
  db: wire(createDb),
  users: wire(createUsers, ["db"]),
});
`,
      "/app/src/wire.ts",
    );
    const out = emitWireContainer(graph, "/app/src/container.gen.ts");
    expect(out).toContain(
      'import { createDb, createUsers } from "./infra.js";',
    );
  });

  it("rejects spread properties in defineWire object", () => {
    expect(() =>
      parseWireSource(
        `
import { defineWire, wire } from "@zwents/cli/wire";
import { createDb } from "./db.js";
const extra = {};
export default defineWire({
  db: wire(createDb),
  ...extra,
});
`,
        "/app/wire.ts",
      ),
    ).toThrow(/only property assignments/);
  });

  it("supports string-literal provider keys", () => {
    const graph = parseWireSource(
      `
import { defineWire, wire } from "@zwents/cli/wire";
import { createDb } from "./db.js";
export default defineWire({
  "db": wire(createDb),
});
`,
      "/app/wire.ts",
    );
    expect(graph.providers[0]?.key).toBe("db");
  });
});
