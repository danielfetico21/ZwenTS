---
name: zwents-audit
description: >-
  Full-module ZwenTS audits (not just a git diff): bugs/security/races, API
  contract consistency (Prompt A), or error/resilience (Prompt B). Writes
  docs/reviews/ artifacts. Use when the user asks for an audit, code verification,
  Prompt A/B, or a bugs checklist pass — not for routine post-change verify
  (use zwents-verify for that).
---

# ZwenTS deep audit

**Document-only by default** — do not fix inline unless the user says fix. Flag uncertainty as **needs discussion**.

Prioritize [docs/reviews/bugs-checklist.md](../../../docs/reviews/bugs-checklist.md) before inventing new hunts.

## Modes (pick what the user asked)

| Mode | Agents | Output |
|------|--------|--------|
| **Bugs** (default) | 2–3 by package group, no overlap | `docs/reviews/review-<area>.md` + `review-summary.md` |
| **API / Prompt A** | 1–2 on **whole** public surface (do not split by module) | `docs/reviews/api-review.md` (update or new dated notes) |
| **Resilience / Prompt B** | 2–3 by subsystem (core/http, security stack, schema/cli) | `docs/reviews/resilience-review-<area>.md` + summary |

Also load [zwents-conventions](../zwents-conventions/SKILL.md), [zwents-testing](../zwents-testing/SKILL.md), [zwents-security-middleware](../zwents-security-middleware/SKILL.md) as relevant.

---

## Bugs mode — categories

For each assigned area, check:

1. **Bugs / logic** — off-by-one, bad conditionals, null/undefined, swallowed errors, unsafe casts  
2. **Security** — injection, bad validation, secrets, authz holes, header injection (CR/LF)  
3. **Leaks** — unreleased handles/listeners, caches without eviction, missing `dispose`/`onStop`  
4. **Races** — shared mutable state, non-atomic RMW, abort/timeout cleanup, `Promise.all` isolation  
5. **Business logic** — ownership, idempotency fingerprint, demo-auth fail-closed  

ZwenTS hotspots: `ctx.respond` vs `next()`, `ctx.responseHeaders` on errors, in-memory stores, Problem Details `cause`/stack leak, `listen`/`stop` serialization.

### Per-agent file format

Write `docs/reviews/review-<area>.md`:

```markdown
# Code Review: [Area]

## Summary
…

## Verified OK
- …

## Issues Found
### [short title]
- **Severity:** Critical / High / Medium / Low
- **Category:** Bug / Security / Memory Leak / Race Condition / Business Logic
- **Location:** path:line (or symbol)
- **Description:** …
- **Suggested Fix:** …
- **needs discussion:** yes/no

## Regression Tests Needed
- `it("…")` titles
```

Parent consolidates into `docs/reviews/review-summary.md` by severity. Update `bugs-checklist.md` IDs/status.

**Suggested splits (no overlap):**

1. `core` + `http`  
2. `auth` + `security` + `ratelimit` + `idempotency` + `otel`  
3. `schema` + `openapi` + `cli` + `config` + examples  

---

## API mode (Prompt A) — whole surface

1. Inventory every export from `packages/*/index.ts` (+ `cli` `./wire`).  
2. Check naming, error shape (`appError` / Problem Details / bare `Error` for programmer bugs), null vs undefined, pagination patterns, semver/breaking risk, encapsulation (no `lib/` leaks), surprising side effects.  
3. Cross-check [docs/api-style.md](../../../docs/api-style.md) + [docs/semver-contract.md](../../../docs/semver-contract.md).  
4. Write/update `docs/reviews/api-review.md` with: Inventory, Consistent Patterns, Inconsistencies (Impact + Suggested Fix), Breaking Change Risks, Recommended Standard.

---

## Resilience mode (Prompt B)

Categories: Error Quality · Async Handling · Network Resilience · Graceful Degradation · Validation/Fail-fast · Consumer Experience.

ZwenTS focus: `installProcessSignals` / `fatalErrors`, drain + `onStop`, request timeouts, body limits, idempotency retries, documented throws ([api-throws.md](../../../docs/api-throws.md)), no stack leak on wire.

Output `docs/reviews/resilience-review-<area>.md` + `resilience-review-summary.md` (same severity structure as Bugs).

---

## Optional later passes (only if user asks)

Do **not** run by default: Performance, Observability deep-dive, Dependency supply-chain, Nest-level DX docs. Point to existing recipes (`otel`, `metrics`, `deploy`) if briefly relevant.

## Anti-patterns

- Fixing while auditing (unless asked)  
- Overlapping agent scopes  
- Guessing without reading code — mark **needs discussion**  
- Re-litigating already **fixed** checklist rows without new evidence  
