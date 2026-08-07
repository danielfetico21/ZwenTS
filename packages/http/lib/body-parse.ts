import { appError, ErrorCodes, type UploadedFile } from "@zwents/core";
import {
  DEFAULT_MULTIPART_MAX_BYTES,
  readMultipartBody,
  type MultipartBodyOptions,
} from "./body-multipart.js";
import {
  DEFAULT_MAX_BYTES,
  readBytesLimited,
  type ReadBodyOptions,
} from "./body-read.js";

export type ParsedRequestBody = {
  body?: unknown;
  raw?: Uint8Array;
  files?: readonly UploadedFile[];
};

export type ParseRequestBodyOptions = ReadBodyOptions & {
  multipart?: MultipartBodyOptions;
};

/**
 * Content-type aware body parser for the HTTP adapter.
 * - `application/json` → `{ body, raw }`
 * - `multipart/form-data` → `{ body: fields, files }`
 * - other bodies → `{ raw }`
 */
export async function parseRequestBody(
  request: Request,
  options: ParseRequestBodyOptions = {},
): Promise<ParsedRequestBody> {
  if (request.method === "GET" || request.method === "HEAD") {
    return {};
  }

  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  if (contentType.includes("multipart/form-data")) {
    const multipart = await readMultipartBody(request, {
      maxBytes: options.multipart?.maxBytes ?? DEFAULT_MULTIPART_MAX_BYTES,
      maxFileBytes: options.multipart?.maxFileBytes,
      maxFieldBytes: options.multipart?.maxFieldBytes,
      maxFiles: options.multipart?.maxFiles,
      maxFields: options.multipart?.maxFields,
      signal: options.signal,
    });
    return { body: multipart.body, files: multipart.files };
  }

  if (contentType.includes("application/json")) {
    const raw = await readBytesLimited(request, maxBytes, options.signal);
    if (raw.byteLength === 0) return { raw };
    const text = new TextDecoder().decode(raw);
    try {
      return { body: JSON.parse(text) as unknown, raw };
    } catch (cause) {
      throw appError(ErrorCodes.INVALID_JSON, {
        detail: "Request body is not valid JSON",
        cause,
      });
    }
  }

  // text/*, octet-stream, missing type, etc.
  if (
    contentType.length === 0 &&
    request.headers.get("content-length") === "0"
  ) {
    return {};
  }

  const raw = await readBytesLimited(request, maxBytes, options.signal);
  if (raw.byteLength === 0) return {};
  return { raw };
}

/**
 * Parse JSON body when `Content-Type` includes `application/json`.
 * Returns `undefined` for other content types (does not consume the body).
 */
export async function readJsonBody(
  request: Request,
  options: ReadBodyOptions = {},
): Promise<unknown> {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return undefined;
  }
  const parsed = await parseRequestBody(request, {
    maxBytes: options.maxBytes,
    signal: options.signal,
  });
  return parsed.body;
}
