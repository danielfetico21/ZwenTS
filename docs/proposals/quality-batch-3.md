# Proposal: Quality Batch 3 — API / DX decisions

- **Status:** Accepted (implemented in tree)
- **Related:** [quality-review-summary.md](../reviews/quality/quality-review-summary.md) Batch 3; RFC 0003 §4.2
- **Goal:** Close the remaining “needs discussion” maintainability items without growing public surface carelessly.

---

## Recommendations

| # | Topic | Verdict |
|---|--------|---------|
| E | Typed dispatch input + shared state key | **Yes** — `DispatchInput`, `DISPATCH_INPUT_STATE_KEY`, `getDispatchInput` in `@zwents/core` |
| F | `createRoute<S>()` factory | **Yes** — pin services once; keep `route()` for default/`unknown` apps |
| G | Client query parity | **Yes** — emit optional/required `query` + `URLSearchParams` (style/explode still out of scope) |
| H | Shared `isSafeToken` | **Yes** — live in `@zwents/security`; idempotency + ratelimit depend on it |
| H′ | Ratelimit strip → reject | **Skip limiting** when key fails `isSafeToken` (same as `key: () => null`), do **not** strip into a shared bucket |
| 3 / 4 | Hono wrapper / `compileRoute` export | Already done in Batch 1 |

---

## Notes

- **E:** Adapters already pass `Omit<RawRouteInput, "params">`; typing documents that contract.
- **F:** Factory is a thin wrapper; inference stays on Zod schemas per call.
- **G:** OpenAPI `style` / `explode` / non-200 responses remain MVP gaps (document in RFC 0003).
- **H:** Charset `[\w.:@-]` + CR/LF/NUL + max length; request-id default max 128, idempotency/ratelimit 256.
