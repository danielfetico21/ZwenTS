import fs from "node:fs/promises";
import path from "node:path";
import { emitWireContainer } from "./emit.js";
import { parseWireFile } from "./parse.js";
import type { GenerateWireOptions } from "./types.js";

export type {
  GenerateWireOptions,
  ImportBinding,
  WireGraphAst,
  WireProviderAst,
} from "./types.js";
export { WireCodegenError } from "./errors.js";
export { parseWireFile, parseWireSource } from "./parse.js";
export { topoSortProviders } from "./topo.js";
export { emitWireContainer } from "./emit.js";

export async function generateWireContainer(
  options: GenerateWireOptions,
): Promise<{ out: string; source: string }> {
  const graph = await parseWireFile(options.from);
  const out = path.resolve(options.out);
  const source = emitWireContainer(graph, out);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, source, "utf8");
  return { out, source };
}
