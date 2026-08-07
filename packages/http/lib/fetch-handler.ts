import {
  problemJson,
  toProblemDetails,
  type App,
  type AppResponse,
} from "@zwents/core";
import {
  DEFAULT_MAX_BODY_BYTES,
  parseRequestBody,
  type MultipartBodyOptions,
} from "./body.js";
import { parseSearchParams } from "./query.js";
import { createTimeoutSignal, whenAborted } from "./timeout.js";

export type FetchHandlerOptions = {
  /**
   * Max JSON/raw body size in bytes. Defaults to 1 MiB.
   * Set to `Infinity` to disable the limit.
   */
  maxBodyBytes?: number;
  /** Multipart limits (defaults: 5 MiB total, 2 MiB/file, 10 files). */
  multipart?: MultipartBodyOptions;
  /**
   * Fail the request after this many ms (body read + handler).
   * Defaults to 30_000. Set to `0` to disable.
   */
  requestTimeoutMs?: number;
};

function toWebResponse(result: AppResponse): Response {
  const headers = new Headers(result.headers);
  if (
    !headers.has("content-type") &&
    result.body !== null &&
    result.body !== undefined
  ) {
    headers.set("content-type", "application/json; charset=utf-8");
  }

  if (
    result.body === null ||
    result.body === undefined ||
    result.status === 204
  ) {
    return new Response(null, { status: result.status, headers });
  }

  if (typeof result.body === "string") {
    return new Response(result.body, { status: result.status, headers });
  }

  // Streams / binary (SSE, files) — pass through without JSON.stringify.
  if (
    typeof ReadableStream !== "undefined" &&
    result.body instanceof ReadableStream
  ) {
    return new Response(result.body, { status: result.status, headers });
  }
  if (result.body instanceof Uint8Array) {
    return new Response(result.body, { status: result.status, headers });
  }
  if (result.body instanceof ArrayBuffer) {
    return new Response(result.body, { status: result.status, headers });
  }

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers,
  });
}

/**
 * Build a `(Request) => Response` adapter for a ZwenTS app (used by `listen`).
 */
export function createFetchHandler<S>(
  app: App<S>,
  options: FetchHandlerOptions = {},
): (request: Request) => Promise<Response> {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const requestTimeoutMs = options.requestTimeoutMs ?? 30_000;

  return async (request) => {
    const timeout =
      requestTimeoutMs > 0
        ? createTimeoutSignal(requestTimeoutMs, request.signal)
        : null;
    const signal = timeout?.signal ?? request.signal;

    try {
      const work = (async () => {
        const url = new URL(request.url);
        const query = parseSearchParams(url.searchParams);
        const parsed = await parseRequestBody(request, {
          maxBytes: maxBodyBytes,
          multipart: options.multipart,
          signal,
        });
        return app.dispatch({
          method: request.method,
          path: url.pathname,
          headers: request.headers,
          signal,
          input: {
            query,
            body: parsed.body,
            raw: parsed.raw,
            files: parsed.files,
          },
        });
      })();

      // If the timeout wins the race, `work` may still reject later — sink it.
      if (timeout) {
        void work.catch(() => undefined);
      }

      const result = timeout
        ? await Promise.race([work, whenAborted(timeout.signal)])
        : await work;

      return toWebResponse(result);
    } catch (error) {
      const details = toProblemDetails(error);
      return toWebResponse(problemJson(details, details.status));
    } finally {
      timeout?.clear();
    }
  };
}

export { toWebResponse };
