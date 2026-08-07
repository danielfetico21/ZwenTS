import { createApp, type App, type AppOptions } from "@zwents/core";
import { listen, type ListenHandle } from "@zwents/http";

export type TestApp<S> = {
  app: App<S>;
  handle: ListenHandle;
  baseUrl: string;
  request: (
    path: string,
    init?: RequestInit,
  ) => Promise<{
    status: number;
    headers: Headers;
    json: <T = unknown>() => Promise<T>;
    text: () => Promise<string>;
  }>;
  close: () => Promise<void>;
};

/**
 * Build an app, listen on an ephemeral port, and return a small HTTP client.
 */
export async function startTestApp<S>(
  options: AppOptions<S>,
  configure: (app: App<S>) => void,
): Promise<TestApp<S>> {
  const app = createApp(options);
  configure(app);
  const handle = await listen(app, { port: 0, host: "127.0.0.1" });
  const baseUrl = `http://${handle.host}:${handle.port}`;

  return {
    app,
    handle,
    baseUrl,
    async request(path, init) {
      const res = await fetch(new URL(path, baseUrl), init);
      return {
        status: res.status,
        headers: res.headers,
        json: <T = unknown>() => res.json() as Promise<T>,
        text: () => res.text(),
      };
    },
    async close() {
      await app.stop();
    },
  };
}
