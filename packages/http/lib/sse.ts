import type { AppResponse } from "@zwents/core";

export type SseEvent = {
  data: string;
  event?: string;
  id?: string;
  retry?: number;
};

const encoder = new TextEncoder();

/** Reject CR/LF/NUL so field values cannot inject extra SSE lines. */
function assertSseField(value: string, field: string): string {
  if (/[\r\n\0]/.test(value)) {
    throw new Error(`SSE ${field} must not contain CR, LF, or NUL`);
  }
  return value;
}

/** Encode one SSE event block (including trailing blank line). */
export function encodeSseEvent(event: SseEvent): string {
  let out = "";
  if (event.event !== undefined) {
    out += `event: ${assertSseField(event.event, "event")}\n`;
  }
  if (event.id !== undefined) {
    out += `id: ${assertSseField(event.id, "id")}\n`;
  }
  if (event.retry !== undefined) {
    if (!Number.isFinite(event.retry) || event.retry < 0) {
      throw new Error("SSE retry must be a non-negative finite number");
    }
    out += `retry: ${Math.floor(event.retry)}\n`;
  }
  // Normalize CRLF / bare CR so data lines cannot smuggle field names.
  const data = event.data.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (const line of data.split("\n")) {
    out += `data: ${line}\n`;
  }
  out += "\n";
  return out;
}

function isReadableStream(
  value: unknown,
): value is ReadableStream<Uint8Array> {
  return (
    typeof ReadableStream !== "undefined" &&
    value instanceof ReadableStream
  );
}

function isAsyncIterable(
  value: unknown,
): value is AsyncIterable<SseEvent> {
  return (
    typeof value === "object" &&
    value !== null &&
    !isReadableStream(value) &&
    Symbol.asyncIterator in value
  );
}

function streamFromIterable(
  source: AsyncIterable<SseEvent>,
): ReadableStream<Uint8Array> {
  let iterator: AsyncIterator<SseEvent> | undefined;
  // Object so cancel() mutations are visible to the start() loop (and oxlint).
  const state = { cancelled: false };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      iterator = source[Symbol.asyncIterator]();
      try {
        while (!state.cancelled) {
          const next = await iterator.next();
          if (next.done || state.cancelled) break;
          controller.enqueue(encoder.encode(encodeSseEvent(next.value)));
        }
        if (!state.cancelled) controller.close();
      } catch (error) {
        if (!state.cancelled) controller.error(error);
      }
    },
    async cancel() {
      state.cancelled = true;
      try {
        await iterator?.return?.();
      } catch {
        // Ignore producer cleanup errors on cancel.
      }
    },
  });
}

/**
 * Build an `AppResponse` for Server-Sent Events.
 * Use with `ctx.respond(...)` so the body is not JSON-serialized.
 *
 * When the client disconnects, the stream `cancel`s and calls
 * `AsyncIterator.return()` so generators can stop. Long-lived producers
 * should also exit promptly after `yield` (or honor an abort of their own).
 *
 * WebSocket adapters are not shipped — use a dedicated WS library beside
 * `listen` if you need bidirectional sockets.
 */
export function sseResponse(
  source: ReadableStream<Uint8Array> | AsyncIterable<SseEvent>,
  init: { status?: number; headers?: Record<string, string> } = {},
): AppResponse {
  // Prefer ReadableStream identity — Node/web streams are also async-iterable.
  const body = isReadableStream(source)
    ? source
    : isAsyncIterable(source)
      ? streamFromIterable(source)
      : source;

  return {
    status: init.status ?? 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
      ...init.headers,
    },
    body,
  };
}
