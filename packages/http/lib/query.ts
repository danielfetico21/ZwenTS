/**
 * Parse URL search params.
 * Single occurrence → `string`; repeated keys → `string[]` (order preserved).
 */
export function parseSearchParams(
  params: URLSearchParams,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of params.keys()) {
    if (Object.hasOwn(out, key)) continue;
    const values = params.getAll(key);
    out[key] = values.length <= 1 ? (values[0] ?? "") : values;
  }
  return out;
}
