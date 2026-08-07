import { appError, ErrorCodes } from "@zwents/core";
import { abortReasonAsAppError } from "./timeout.js";

export type ReadBodyOptions = {
  /** Max raw/JSON body bytes. Defaults to 1 MiB. Use `Infinity` to disable. */
  maxBytes?: number;
  signal?: AbortSignal;
};

export const DEFAULT_MAX_BYTES = 1024 * 1024;

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw abortReasonAsAppError(
    signal.reason,
    "Request aborted while reading body",
  );
}

export function assertMaxBytes(maxBytes: number): void {
  if (
    maxBytes !== Number.POSITIVE_INFINITY &&
    (!Number.isFinite(maxBytes) || maxBytes < 0)
  ) {
    throw new Error(
      "@zwents/http: maxBytes must be a number ≥ 0 or Infinity",
    );
  }
}

function concatBytes(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function rejectIfContentLengthTooLarge(
  request: Request,
  maxBytes: number,
): void {
  if (maxBytes === Number.POSITIVE_INFINITY) return;
  const contentLength = request.headers.get("content-length");
  if (contentLength === null) return;
  const declared = Number(contentLength);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw appError(ErrorCodes.PAYLOAD_TOO_LARGE, {
      detail: `Request body exceeds limit of ${maxBytes} bytes`,
      extras: { maxBytes, contentLength: declared },
    });
  }
}

/**
 * Read request body bytes with a hard byte cap (Content-Length + streaming).
 */
export async function readBytesLimited(
  request: Request,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  throwIfAborted(signal);
  assertMaxBytes(maxBytes);
  rejectIfContentLengthTooLarge(request, maxBytes);

  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      throwIfAborted(signal);
      const readPromise = reader.read();
      const result = signal
        ? await Promise.race([
            readPromise,
            new Promise<never>((_, reject) => {
              const onAbort = (): void => {
                reject(
                  abortReasonAsAppError(
                    signal.reason,
                    "Request aborted while reading body",
                  ),
                );
              };
              /* v8 ignore next 4 */
              if (signal.aborted) {
                onAbort();
                return;
              }
              signal.addEventListener("abort", onAbort, { once: true });
              void readPromise.finally(() => {
                signal.removeEventListener("abort", onAbort);
              });
            }),
          ])
        : await readPromise;

      const { done, value } = result;
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw appError(ErrorCodes.PAYLOAD_TOO_LARGE, {
          detail: `Request body exceeds limit of ${maxBytes} bytes`,
          extras: { maxBytes },
        });
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // already canceled / released
    }
  }

  if (total === 0) return new Uint8Array();
  return concatBytes(chunks, total);
}

/**
 * Read request body text with a hard byte cap (Content-Length + streaming).
 */
export async function readTextLimited(
  request: Request,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<string> {
  const bytes = await readBytesLimited(request, maxBytes, signal);
  if (bytes.byteLength === 0) return "";
  return new TextDecoder().decode(bytes);
}

/**
 * Read raw body bytes (any content-type), enforcing `maxBytes`.
 */
export async function readRawBody(
  request: Request,
  options: ReadBodyOptions = {},
): Promise<Uint8Array> {
  if (request.method === "GET" || request.method === "HEAD") {
    return new Uint8Array();
  }
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  return readBytesLimited(request, maxBytes, options.signal);
}
