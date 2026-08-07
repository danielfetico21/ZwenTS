import type { Middleware } from "@zwents/core";
import { assertSafeHeaderValue } from "./header-value.js";

export type SecurityHeadersOptions = {
  /** Defaults to `nosniff`. Set `false` to omit. */
  contentTypeOptions?: string | false;
  /** Defaults to `DENY`. Set `false` to omit. */
  frameOptions?: string | false;
  /** Defaults to `no-referrer`. Set `false` to omit. */
  referrerPolicy?: string | false;
  /**
   * Defaults to
   * `max-age=31536000; includeSubDomains`.
   * Set `false` to omit (typical for local HTTP).
   */
  strictTransportSecurity?: string | false;
  /** Defaults to `accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()`. */
  permissionsPolicy?: string | false;
  /** Extra headers merged last (lowercase keys). */
  extras?: Readonly<Record<string, string>>;
};

const SLOTS = [
  {
    option: "contentTypeOptions",
    header: "x-content-type-options",
    defaultValue: "nosniff",
  },
  {
    option: "frameOptions",
    header: "x-frame-options",
    defaultValue: "DENY",
  },
  {
    option: "referrerPolicy",
    header: "referrer-policy",
    defaultValue: "no-referrer",
  },
  {
    option: "strictTransportSecurity",
    header: "strict-transport-security",
    defaultValue: "max-age=31536000; includeSubDomains",
  },
  {
    option: "permissionsPolicy",
    header: "permissions-policy",
    defaultValue:
      "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  },
] as const satisfies ReadonlyArray<{
  option: keyof SecurityHeadersOptions;
  header: string;
  defaultValue: string;
}>;

/**
 * Apply Helmet-like security headers via `ctx.responseHeaders`
 * (present on success and error responses).
 */
export function securityHeaders(
  options: SecurityHeadersOptions = {},
): Middleware {
  const headers: Record<string, string> = {};

  for (const slot of SLOTS) {
    const value = options[slot.option];
    if (value === false) continue;
    headers[slot.header] =
      typeof value === "string" ? value : slot.defaultValue;
  }

  if (options.extras) {
    for (const [key, value] of Object.entries(options.extras)) {
      assertSafeHeaderValue(key, "extras header name");
      assertSafeHeaderValue(value, `extras[${key}]`);
      headers[key.toLowerCase()] = value;
    }
  }

  for (const [key, value] of Object.entries(headers)) {
    assertSafeHeaderValue(value, key);
  }

  return async (ctx, next) => {
    Object.assign(ctx.responseHeaders, headers);
    await next();
  };
}
