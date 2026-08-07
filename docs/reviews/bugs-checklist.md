# Bugs checklist (known / suspected)

Updated after Low-fix pass → see [`review-summary.md`](./review-summary.md).

| ID | Area | Suspicion | Status |
|----|------|-----------|--------|
| C1 | `@zwents/idempotency` store | Expired in-flight prune / waiter leaks | **fixed** (+ optional sweep) |
| C2 | `@zwents/http` `listen().close()` | Concurrent close double-`server.close` | **verified OK** |
| C3 | `@zwents/http` body read | Abort path stream cancel / releaseLock | **verified OK** |
| C4 | `@zwents/ratelimit` | In-memory only; XFF trust; prune/eviction | **fixed** |
| C5 | `@zwents/auth` | Optional bearer + authorize ordering; OpenAPI meta | **fixed** |
| C6 | `@zwents/core` `app.stop` | STOP_TIMEOUT orphan hooks / retry overlap | **fixed** |
| C7 | `@zwents/http` fetch-handler | `whenAborted` race → unhandledRejection | **fixed** |
| C8 | `@zwents/schema` `route()` | Result unwrap / rawBody / errors map | **fixed** |
| C9 | `@zwents/openapi` | `$ref` rewrite, client API | **fixed** |
| C10 | `@zwents/cli` wire codegen | AST / path / injection | **fixed** (+ cwd gate) |
| C11 | Multipart / raw body | Boundary attacks, size limits | **fixed** |
| C12 | Examples `notes-api` | Authz ownership, idempotency, demo auth | **fixed** |
| C13 | Multi-instance | In-memory stores vs shared deploy | **ops** (not a code bug) |
| C14 | OTEL | Global provider pollution in tests | **partial** (API limit) |

## Skipped Low

- oxlint `require-route-output` alias binding — heuristic by design
