import type { RequestContext } from "@zwents/core";

/** Reject CR/LF/NUL so values cannot split HTTP headers. */
export function isSafeHeaderValue(value: string): boolean {
  return !/[\r\n\0]/.test(value);
}

export function assertSafeHeaderValue(value: string, label: string): string {
  if (!isSafeHeaderValue(value)) {
    throw new Error(
      `@zwents/security: ${label} must not contain CR, LF, or NUL`,
    );
  }
  return value;
}

/** Set a single response header (lowercase name) merged by `createApp`. */
export function setResponseHeader(
  ctx: RequestContext,
  name: string,
  value: string,
): void {
  assertSafeHeaderValue(name, "header name");
  assertSafeHeaderValue(value, name);
  ctx.responseHeaders[name.toLowerCase()] = value;
}
