# Raw body & multipart

## Raw body (webhooks)

`@zwents/http` keeps exact bytes for `application/json` on `input.raw`.

```ts
route({
  method: "POST",
  path: "/webhooks/stripe",
  rawBody: "utf8", // or "bytes"
  handler: async (ctx, input) => {
    verify(input.raw, ctx.req.headers.get("stripe-signature"));
    const event = JSON.parse(input.raw);
    return { received: true };
  },
});
```

Limits: `maxBodyBytes` (default 1 MiB) via `listen` / `createFetchHandler`.

## Multipart uploads

`Content-Type: multipart/form-data` → string fields in `input.body`, files in `input.files`.

```ts
route({
  method: "POST",
  path: "/upload",
  body: z.object({ title: z.string() }),
  handler: async (_ctx, input) => {
    const file = input.files[0];
    // file.filename, file.contentType, file.bytes
    return { title: input.body.title, size: file?.size ?? 0 };
  },
});
```

Defaults: 5 MiB total (`Content-Length`), 2 MiB per file, 10 files. Override with `listen({ multipart: { maxFileBytes, maxFiles } })`.

## Notes

- Prefer `Content-Length` so limits apply before buffering.
- JSON routes that also need signatures: use `rawBody: "utf8"` (raw is always captured for JSON).
- Uploaded files are buffered in memory — stream to object storage in app code for large assets.
