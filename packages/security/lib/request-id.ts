import type { Middleware } from "@zwents/core";
import { isSafeToken } from "./safe-token.js";

const DEFAULT_MAX_LENGTH = 128;

export type RequestIdOptions = {
  /** Incoming header to read. Defaults to `x-request-id`. */
  header?: string;
  /** Outgoing header. Defaults to the same as `header`. */
  responseHeader?: string;
  /** Max accepted length. Defaults to 128. */
  maxLength?: number;
  /** Custom generator when header missing/invalid. Defaults to `crypto.randomUUID()`. */
  generate?: () => string;
};

/**
 * Adopt a validated client `X-Request-Id` or generate one; echo on the response.
 * Mutates `ctx.requestId` and `ctx.responseHeaders`.
 */
export function requestId(options: RequestIdOptions = {}): Middleware {
  const header = (options.header ?? "x-request-id").toLowerCase();
  const responseHeader = (options.responseHeader ?? header).toLowerCase();
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
  const generate = options.generate ?? (() => crypto.randomUUID());

  return async (ctx, next) => {
    // Do not trim: trailing CR/LF must fail validation, not become a short id.
    const raw = ctx.req.headers.get(header) ?? "";
    const id = isSafeToken(raw, { maxLength }) ? raw : generate();
    ctx.requestId = id;
    ctx.responseHeaders[responseHeader] = id;
    await next();
  };
}
