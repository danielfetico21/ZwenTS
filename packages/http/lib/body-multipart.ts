import { appError, ErrorCodes, type UploadedFile } from "@zwents/core";
import {
  assertMaxBytes,
  readBytesLimited,
  throwIfAborted,
} from "./body-read.js";

export type MultipartBodyOptions = {
  /** Max total multipart payload bytes (stream + Content-Length). Defaults to 5 MiB. */
  maxBytes?: number;
  /** Max bytes per file. Defaults to 2 MiB. */
  maxFileBytes?: number;
  /** Max UTF-8 bytes per text field. Defaults to 64 KiB. */
  maxFieldBytes?: number;
  /** Max file parts. Defaults to 10. */
  maxFiles?: number;
  /** Max non-file fields. Defaults to 64. */
  maxFields?: number;
  signal?: AbortSignal;
};

export const DEFAULT_MULTIPART_MAX_BYTES = 5 * 1024 * 1024;
export const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const DEFAULT_MAX_FILES = 10;

const DEFAULT_MAX_FIELD_BYTES = 64 * 1024;
const DEFAULT_MAX_FIELDS = 64;

/**
 * Parse `multipart/form-data` into string fields + file parts.
 * Enforces Content-Length and per-file / file-count limits.
 */
export async function readMultipartBody(
  request: Request,
  options: MultipartBodyOptions = {},
): Promise<{ body: Record<string, string>; files: UploadedFile[] }> {
  if (request.method === "GET" || request.method === "HEAD") {
    return { body: {}, files: [] };
  }

  const maxBytes = options.maxBytes ?? DEFAULT_MULTIPART_MAX_BYTES;
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxFieldBytes = options.maxFieldBytes ?? DEFAULT_MAX_FIELD_BYTES;
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxFields = options.maxFields ?? DEFAULT_MAX_FIELDS;
  assertMaxBytes(maxBytes);
  throwIfAborted(options.signal);

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    throw appError(ErrorCodes.VALIDATION_ERROR, {
      detail: "Expected multipart/form-data body",
      extras: { location: "body" },
    });
  }

  // Cap streamed bytes before formData(); Content-Length alone is not trusted.
  const bytes = await readBytesLimited(request, maxBytes, options.signal);
  const rebuilt = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: bytes,
    duplex: "half",
  } as RequestInit);

  let form: FormData;
  try {
    form = await rebuilt.formData();
  } catch (cause) {
    throw appError(ErrorCodes.VALIDATION_ERROR, {
      detail: "Invalid multipart body",
      cause,
      extras: { location: "body" },
    });
  }

  const body: Record<string, string> = {};
  const files: UploadedFile[] = [];
  let fieldCount = 0;

  for (const [field, value] of form.entries()) {
    throwIfAborted(options.signal);
    if (typeof value === "string") {
      fieldCount += 1;
      if (fieldCount > maxFields) {
        throw appError(ErrorCodes.PAYLOAD_TOO_LARGE, {
          detail: `Too many multipart fields (max ${maxFields})`,
          extras: { maxFields },
        });
      }
      const fieldBytes = new TextEncoder().encode(value).byteLength;
      if (fieldBytes > maxFieldBytes) {
        throw appError(ErrorCodes.PAYLOAD_TOO_LARGE, {
          detail: `Multipart field "${field}" exceeds limit of ${maxFieldBytes} bytes`,
          extras: { maxFieldBytes, field },
        });
      }
      body[field] = value;
      continue;
    }

    const file = value as File;
    const buffer = new Uint8Array(await file.arrayBuffer());
    if (buffer.byteLength > maxFileBytes) {
      throw appError(ErrorCodes.PAYLOAD_TOO_LARGE, {
        detail: `File "${file.name}" exceeds limit of ${maxFileBytes} bytes`,
        extras: { maxFileBytes, field, filename: file.name },
      });
    }
    files.push({
      field,
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      size: buffer.byteLength,
      bytes: buffer,
    });
    if (files.length > maxFiles) {
      throw appError(ErrorCodes.PAYLOAD_TOO_LARGE, {
        detail: `Too many files (max ${maxFiles})`,
        extras: { maxFiles },
      });
    }
  }

  return { body, files };
}
