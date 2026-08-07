import { WireCodegenError } from "./errors.js";
import type { WireProviderAst } from "./types.js";

export function topoSortProviders(
  providers: readonly WireProviderAst[],
  seeds: readonly string[],
): WireProviderAst[] {
  const byKey = new Map(providers.map((p) => [p.key, p]));
  const seedSet = new Set(seeds);
  const keys = providers.map((p) => p.key);

  for (const p of providers) {
    for (const dep of p.deps) {
      if (!byKey.has(dep) && !seedSet.has(dep)) {
        throw new WireCodegenError(
          `Missing binding "${dep}" required by provider "${p.key}" (line ${p.line})`,
        );
      }
    }
  }

  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const key of keys) {
    indegree.set(key, 0);
    dependents.set(key, []);
  }

  for (const p of providers) {
    let count = 0;
    for (const dep of p.deps) {
      if (seedSet.has(dep)) continue;
      count += 1;
      dependents.get(dep)!.push(p.key);
    }
    indegree.set(p.key, count);
  }

  const queue = keys.filter((k) => indegree.get(k) === 0);
  const ordered: WireProviderAst[] = [];

  while (queue.length > 0) {
    const key = queue.shift()!;
    ordered.push(byKey.get(key)!);
    for (const next of dependents.get(key) ?? []) {
      const nextDeg = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextDeg);
      if (nextDeg === 0) queue.push(next);
    }
  }

  if (ordered.length !== providers.length) {
    const remaining = keys.filter((k) => (indegree.get(k) ?? 0) > 0);
    const cycle = findCycle(remaining, byKey, seedSet);
    throw new WireCodegenError(
      `Circular dependency: ${cycle.join(" → ")}`,
    );
  }

  return ordered;
}

function findCycle(
  remaining: string[],
  byKey: Map<string, WireProviderAst>,
  seeds: Set<string>,
): string[] {
  const remainingSet = new Set(remaining);
  const start = remaining[0]!;
  const pathKeys: string[] = [];
  const visiting = new Set<string>();

  const dfs = (key: string): string[] | null => {
    if (visiting.has(key)) {
      const idx = pathKeys.indexOf(key);
      return [...pathKeys.slice(idx), key];
    }
    if (!remainingSet.has(key)) return null;
    visiting.add(key);
    pathKeys.push(key);
    const provider = byKey.get(key);
    for (const dep of provider?.deps ?? []) {
      if (seeds.has(dep)) continue;
      const cycle = dfs(dep);
      if (cycle) return cycle;
    }
    /* istanbul ignore next */
    pathKeys.pop();
    /* istanbul ignore next */
    visiting.delete(key);
    /* istanbul ignore next */
    return null;
  };

  /* istanbul ignore next */
  return dfs(start) ?? [...remaining, remaining[0]!];
}
