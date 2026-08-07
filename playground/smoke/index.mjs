/**
 * Consumer smoke: import packed @zwents/* tarballs (not workspace sources).
 */
import { createApp } from "@zwents/core";
import { createFetchHandler } from "@zwents/http";
import { route } from "@zwents/schema";
import { z } from "zod";

const app = createApp({ context: {} }).route(
  route({
    method: "GET",
    path: "/hello",
    output: z.object({ message: z.string() }),
    handler: async () => ({ message: "packed-ok" }),
  }),
);

await app.start();
const handle = createFetchHandler(app);
const res = await handle(new Request("http://localhost/hello"));
const body = await res.json();

if (res.status !== 200 || body.message !== "packed-ok") {
  console.error("smoke failed", { status: res.status, body });
  process.exit(1);
}

console.log("smoke ok:", body);
await app.stop();
