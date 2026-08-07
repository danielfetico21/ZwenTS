# Repo layout

Where things live — and what would ship to a registry later.

| Loc | Role | On npm? |
|-----|------|---------|
| `packages/*` | Public `@zwents/*` libraries. Only `dist/` is packed (`files: ["dist"]`). | Yes (future) |
| `docs/` | Internal source of truth: RFCs, reviews, SESSION-LOG, recipe drafts. | No |
| `apps/docs/` | VitePress site (`@zwents/docs`, private). Consumer-facing docs. | No |
| `examples/*` | Monorepo demos (`private`, `workspace:*`). | No |
| `playground/` | Outside the pnpm workspace — install packed tarballs like a real consumer. | No |

## Local consumer test (no npm publish)

```bash
pnpm pack:local          # build packages/* → .packs/*.tgz
cd playground/smoke
pnpm i                   # or: npm i / bun i  (own pnpm-workspace.yaml + overrides)
node index.mjs
```

See [playground/smoke/README.md](../playground/smoke/README.md).
