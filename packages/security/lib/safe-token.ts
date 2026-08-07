import { isSafeHeaderValue } from "./header-value.js";

/** Visible ASCII token charset shared by request-id / idempotency / ratelimit keys. */
const SAFE_TOKEN = /^[\w.:@-]+$/;

export type SafeTokenOptions = {
  /** Max accepted length. Defaults to 128. */
  maxLength?: number;
};

/**
 * Reject empty values, over-long values, CR/LF/NUL, and non-token characters.
 * Charset: letters, digits, `_`, `.`, `:`, `@`, `-`.
 */
export function isSafeToken(
  value: string,
  options: SafeTokenOptions = {},
): boolean {
  const maxLength = options.maxLength ?? 128;
  if (value.length === 0 || value.length > maxLength) return false;
  if (!isSafeHeaderValue(value)) return false;
  return SAFE_TOKEN.test(value);
}
