/**
 * Runtime helpers for Wire manifests (RFC 0005).
 * Codegen (`zwen gen:wire`) reads the same declarations from source via AST.
 */

export type WireBinding<
  F extends (...args: never[]) => unknown = (...args: never[]) => unknown,
> = {
  readonly factory: F;
  readonly deps: readonly string[];
};

export type WireProviders = Record<string, WireBinding>;

export type WireDefinition<P extends WireProviders = WireProviders> = {
  readonly providers: P;
  /** Keys included in the returned container (default: all provider keys). */
  readonly expose?: readonly (keyof P & string)[];
  /**
   * Names injected as `buildContainer(...)` parameters (available as deps
   * before any provider runs).
   */
  readonly seeds?: readonly string[];
  /** Generated function name. Default: `buildContainer`. */
  readonly functionName?: string;
};

/** Tag a factory + its named dependency keys for codegen. */
export function wire<F extends (...args: never[]) => unknown>(
  factory: F,
  deps: readonly string[] = [],
): WireBinding<F> {
  return { factory, deps };
}

function isWireBinding(value: unknown): value is WireBinding {
  return (
    typeof value === "object" &&
    value !== null &&
    "factory" in value &&
    typeof (value as WireBinding).factory === "function" &&
    Array.isArray((value as WireBinding).deps)
  );
}

function isFlatProviders(
  value: object,
): value is WireProviders {
  const keys = Object.keys(value);
  if (keys.length === 0) return false;
  if ("providers" in value) return false;
  return keys.every((key) => isWireBinding((value as Record<string, unknown>)[key]));
}

/**
 * Declare a wire graph. Prefer explicit `deps` on each `wire(...)` binding —
 * codegen topo-sorts and fails on cycles / missing keys.
 *
 * Flat form (RFC):
 * ```ts
 * defineWire({
 *   db: wire(createDb),
 *   users: wire(createUserService, ["db"]),
 * })
 * ```
 *
 * Full form (seeds / expose):
 * ```ts
 * defineWire({
 *   providers: { db: wire(createDb, ["config"]), ... },
 *   seeds: ["config"],
 *   expose: ["db", "users"],
 * })
 * ```
 */
export function defineWire<P extends WireProviders>(
  def: WireDefinition<P> | P,
): WireDefinition<P> {
  if (isFlatProviders(def)) {
    return { providers: def };
  }
  const full = def as WireDefinition<P>;
  if (!full.providers || typeof full.providers !== "object") {
    throw new Error("defineWire: expected providers map or flat wire(...) bindings");
  }
  return full;
}
