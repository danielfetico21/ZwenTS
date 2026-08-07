/** Strip to a safe TypeScript identifier; never empty / never leading digit. */
export function sanitizeIdent(name: string, fallback = "Ident"): string {
  const cleaned = name.replace(/[^A-Za-z0-9_]/g, "");
  if (!cleaned) return fallback;
  if (/^[0-9]/.test(cleaned)) return `${fallback}${cleaned}`;
  return cleaned;
}

/** Claim `base`, or `base2`, `base3`, … until unused. Mutates `used`. */
export function uniqueIdent(base: string, used: Set<string>): string {
  let name = base;
  let i = 2;
  while (used.has(name)) {
    name = `${base}${i}`;
    i += 1;
  }
  used.add(name);
  return name;
}
