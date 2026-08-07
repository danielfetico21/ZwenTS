---
name: zwents-verify
description: >-
  After writing ZwenTS code, run a multi-agent verification pass on the git diff:
  conventions (DRY/KISS), bugs/races/leaks/security, and tests. Use before push,
  after a feature batch, or when the user says verify / check what we wrote.
  For full-module audits (Prompt A/B, bugs-checklist), use zwents-audit instead.
---

# ZwenTS verify (post-change gate)

Run **after** implementation, **before** commit/push (unless report-only).

Load:

- [zwents-conventions](../zwents-conventions/SKILL.md)
- [zwents-testing](../zwents-testing/SKILL.md)
- [zwents-security-middleware](../zwents-security-middleware/SKILL.md) if security/auth/ratelimit/idempotency touched

For repo-wide audits → [zwents-audit](../zwents-audit/SKILL.md).

## 1. Scope the diff

```bash
git status -sb
git diff --stat
git diff          # or: git diff <base>...HEAD
```

Empty diff → stop. Note touched packages. Skim [docs/reviews/bugs-checklist.md](../../../docs/reviews/bugs-checklist.md) for open rows that intersect the diff.

## 2. Launch **3** parallel agents

One message, three Task agents (`generalPurpose` or `explore`), `model: inherit`.

### Agent A — Conventions

Follow **zwents-conventions**. Diff only. Report `must` / `should` / `nit`. No bug hunting.

### Agent B — Bugs / races / leaks / security

Diff + paths. Instruct:

> Audit this ZwenTS **diff** only (not the whole repo). Categories: Bug, Security, Memory Leak, Race Condition, Business Logic. Also: middleware `respond` vs `next()`, shared stores, abort/timeout cleanup, header CR/LF, Problem Details leaks (`cause`/stack), demo-auth fail-closed.  
> For each issue use: **Severity** (Critical/High/Medium/Low), **Category**, **Location** (path + symbol/line), **Description**, **Suggested Fix**. Mark uncertainty **needs discussion**. Do not fix. Under 600 words. Skip pure style.

Apply **zwents-security-middleware** when those packages are in the diff.

### Agent C — Tests

Follow **zwents-testing**. List missing `it("…")` titles / edge cases. Do not write full suites unless asked.

## 3. Parent runs tooling

```bash
pnpm check
# or focused: tsc -b <pkgs> && vitest run <tests>
```

## 4. Aggregate (keep axes separate)

```markdown
## Verify summary
- Diff scope: …
- Checklist hits: … (from bugs-checklist, if any)
- Tooling: pass / fail

## Conventions (A)
## Bugs / races (B)
## Tests (C)
## Top actions
1. … (Critical/must first)
```

Fix **must + Critical/High** only if the user asked to fix (default for “verify then push”). Otherwise report-only.

**Do not** write `docs/reviews/review-*.md` during verify — that is **zwents-audit**. Optional: append new suspicions as rows in `bugs-checklist.md` with status `suspected`.

## User prompts

```text
zwents-verify on current diff; fix must/Critical.
```

```text
Run zwents-verify (3 agents). Base: origin/main. Report-only.
```
