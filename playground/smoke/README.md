# Consumer smoke (local tarballs)

This folder is **outside** the monorepo workspace packages list. It has its own `pnpm-workspace.yaml` so installs resolve `@zwents/*` from `.packs/*.tgz`, not `workspace:*`.

Until packages are on npm, nested `@zwents/*` deps are forced to local tarballs via `pnpm.overrides` in `package.json`.

```bash
# from repo root
pnpm pack:local

cd playground/smoke
pnpm i          # or: npm i   /   bun i
node index.mjs  # or: pnpm start
```

If a parent workspace still interferes: `pnpm install --ignore-workspace`.

Expect: `smoke ok: { message: 'packed-ok' }`.
