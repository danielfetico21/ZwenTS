# Verification prompts

Two gates:

| When | Skill | What |
|------|-------|------|
| After writing a feature / before push | **zwents-verify** | Diff-only, 3 agents, optional fix |
| Periodic / release / “full audit” | **zwents-audit** | Modules or whole API/resilience; writes `docs/reviews/` |

---

## A) Post-change verify (default)

```text
Run zwents-verify on the current uncommitted diff (or origin/main...HEAD if clean).

3 parallel agents:
1) conventions — .cursor/skills/zwents-conventions (DRY, KISS, deep modules, api-style)
2) bugs/races — Bug/Security/Leak/Race/Logic; middleware respond vs next; Problem Details leaks
3) tests — .cursor/skills/zwents-testing; missing it() titles only

pnpm check (or focused tsc/vitest). Report Conventions / Bugs / Tests / Top actions.
Fix must + Critical/High unless I say report-only.
```

Short:

```text
zwents-verify on current diff; fix must/Critical.
```

---

## B) Deep audit (Claude-style, adapted)

### Bugs / security / races

```text
Run zwents-audit in Bugs mode. Read docs/reviews/bugs-checklist.md first.
3 agents, no overlap: (core+http) / (auth+security+ratelimit+idempotency+otel) / (schema+openapi+cli+examples).
Document-only. Write docs/reviews/review-<area>.md + update review-summary.md and bugs-checklist.md.
Do not fix unless I ask.
```

### API contract (Prompt A)

```text
Run zwents-audit in API mode (Prompt A). Inventory all packages/*/index.ts exports (+ cli ./wire).
Check naming, error shapes, null/undefined, pagination, semver breaks, encapsulation.
Update docs/reviews/api-review.md. Document-only.
```

### Resilience (Prompt B)

```text
Run zwents-audit in Resilience mode (Prompt B).
Agents: core+http / security stack / schema+cli.
Focus: throws docs, timeouts, drain/stop, fatalErrors, wire leaks, fail-fast config.
Write resilience-review-*.md + summary. Document-only.
```

---

## Skills map

| Skill | Path |
|-------|------|
| verify | `.cursor/skills/zwents-verify` |
| conventions | `.cursor/skills/zwents-conventions` |
| audit | `.cursor/skills/zwents-audit` |
| testing | `.cursor/skills/zwents-testing` |
| security mw | `.cursor/skills/zwents-security-middleware` |

## Intentionally not default

Performance, supply-chain, Nest-level DX, observability deep-dives — ask explicitly if needed; we already have otel/metrics/deploy recipes for the common case.
