# Packages

Each package under `packages/` is a **deep module**: a small public surface, hidden implementation.

## Layout

```
packages/<name>/
  index.ts       ← entry point (public). Import this from outside.
  lib/           ← implementation (private)
  tests/         ← tests import only through entry points
  package.json
  tsconfig.json
```

A package may expose several root entry points (`index.ts`, `client.ts`, …). Prefer that over one giant barrel that re-exports an entire subtree.

## Rules

1. Outside a package, import only its root entry points — never `lib/` or other subfolders.
2. Inside a package, files may import each other freely.
3. Tests under `tests/` go through entry points like everyone else.
4. No dependency cycles.

Enforce with:

```bash
pnpm lint:boundaries
```
