/**
 * Explicit composition helper — the manual path that Wire codegen (RFC 0005)
 * will eventually generate. Resolves providers in dependency order.
 */

export type ProviderMap = Record<
  string,
  (deps: Record<string, unknown>) => unknown
>;

export type ComposeOptions = {
  /** Seed values available before any provider runs (e.g. config). */
  seeds?: Record<string, unknown>;
};

/**
 * Build a container object by running each provider once.
 * `provider` functions receive the partially-built container so far.
 *
 * Providers must be listed in dependency order (no auto topo-sort in MVP).
 * Circularity / missing deps surface as runtime errors — codegen (RFC 0005)
 * will make these compile errors.
 */
export function composeProviders<P extends ProviderMap>(
  providers: P,
  options: ComposeOptions = {},
): { [K in keyof P]: ReturnType<P[K]> } {
  const container: Record<string, unknown> = { ...options.seeds };

  for (const [name, factory] of Object.entries(providers)) {
    if (name in container) {
      throw new Error(`composeProviders: duplicate key "${name}"`);
    }
    container[name] = factory(container);
  }

  return container as { [K in keyof P]: ReturnType<P[K]> };
}
