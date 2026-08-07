# Publishing `@zwents/*` (0.1.0+)

## Prerequisites

1. npm org **`@zwents`** (or your scope) with publish rights
2. `NPM_TOKEN` automation token in GitHub Actions secrets (for tag publish)
3. Local: `pnpm login` / `npm login` for the scope

## Local dry-run

```bash
pnpm build
pnpm pack:local                 # tarballs in .packs/
cd playground/smoke && pnpm i && node index.mjs
```

Per-package dry-run:

```bash
pnpm --filter @zwents/core publish --dry-run --no-git-checks
```

## Version bumps (after 0.1.0)

```bash
pnpm changeset                  # pick packages + semver bump
pnpm changeset version          # applies bumps, updates CHANGELOG.md
git add -A && git commit -m "chore: release"
```

Packages under `packages/*` are **fixed** together (`@zwents/*` same version) via [`.changeset/config.json`](../.changeset/config.json).

## Publish

**Manual (local):**

```bash
pnpm build
pnpm --filter "./packages/*" publish --access public --no-git-checks
```

**CI (tag):** push `v0.1.0` (or later). Workflow [`.github/workflows/publish.yml`](../.github/workflows/publish.yml) runs `changeset publish` / filtered publish when `NPM_TOKEN` is set.

## Checklist before a release

- [ ] `pnpm check && pnpm build && pnpm openapi:check`
- [ ] CHANGELOG entry for the version
- [ ] Semver contract: [semver-contract.md](./semver-contract.md)
- [ ] No secrets in examples; demo auth stays fail-closed
