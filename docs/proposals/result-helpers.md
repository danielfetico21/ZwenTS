# Proposal: Result helpers (Go-style errors without try/catch)

- **Status:** Accepted → [RFC 0006](../rfcs/0006-result-helpers.md)
- **Related:** RFC 0001 §4.9, RFC 0004 (`AppError`), existing `Result` / `ok` / `err` in `@zwents/core`
- **Goal:** Make failure **visible in types** (like Go’s `val, err`), without Nest-style magic and without pulling a heavy FP framework.

---

## 1. Recommendation (short)

| Choice | Verdict |
|--------|---------|
| Depend on **Effect** | No — too big; different product |
| Depend on **neverthrow** | Optional later; not default |
| Depend on **oxide.ts** / **@badrap/result** | No — small but still a second error dialect |
| **Own thin Result API in `@zwents/core`** | **Yes** — default |
| Copy ideas / API shapes from **neverthrow** (MIT) | **Yes** — for helpers we choose |

**Why own it**

1. We already ship `Result` / `ok` / `err` and `AppError` — one dialect for the framework.
2. ZwenTS sells “explicit, small core”; a peer on neverthrow splits the ecosystem (`Ok` class vs our `{ ok, value }`).
3. We only need ~10–15 helpers, not a full ResultAsync class hierarchy.
4. HTTP adapters stay simple: map `Result` → Problem Details at the edge.

**When to depend on neverthrow instead**

Only if a team already standardized on it org-wide. Then document an adapter (`toNeverthrow` / `fromNeverthrow`), don’t fork the blessed path.

---

## 2. Shape (blessed)

Prefer a **discriminated union** (not a JS tuple):

```ts
type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

Go mental model:

```go
val, err := doSomething()
if err != nil { return err }
return val
```

ZwenTS:

```ts
const result = await doSomething();
if (!result.ok) return err(result.error); // or just `return result`
return ok(result.value);
```

**Avoid**

- `[T, E]` tuples — bad narrowing, easy to ignore `err`
- Express-style `catchAsync` — still `throw` underneath; hides cost
- Forcing Result on every middleware — keep `throw AppError` OK at HTTP edge if desired

**Layering**

| Layer | Style |
|-------|--------|
| Domain / application services | Prefer `Result<T, AppError>` |
| Zod parse / infra adapters | `fromThrowable` / `fromPromise` at the boundary |
| HTTP handler | Either return `Result` (adapter unwraps) **or** `throw AppError` |

---

## 3. Libraries on the net (what to learn from)

| Library | Size / focus | Take for ZwenTS? |
|---------|--------------|------------------|
| [neverthrow](https://github.com/supermacro/neverthrow) | Pragmatic Result + `ResultAsync`, MIT, widely used | **API inspiration** for `map`, `andThen`, `fromPromise`, `combine` |
| [oxide.ts](https://github.com/traverse1984/oxide.ts) | Rust `Result`/`Option` port | Naming reference only (`unwrap`, `mapErr`) |
| [@badrap/result](https://github.com/badrap/result) | Small idiomatic Result | Skip as dependency |
| **Effect** | Full effect system | Out of scope |
| **fp-ts** `Either` | Full FP toolkit | Out of scope |

neverthrow is the best “steal the checklist from” source: same problems, battle-tested names. We reimplement a **subset** against our plain `{ ok, value } | { ok: false, error }` objects (no `Ok`/`Err` classes required).

---

## 4. Helper catalog

### Tier A — ship first (high use, small)

| Helper | Signature (sketch) | Why |
|--------|-------------------|-----|
| `ok` / `err` | already exist | Constructors |
| `isOk` / `isErr` | type guards | Narrowing without `result.ok` typos in generics |
| `map` | `(r, t => u) => Result<U, E>` | Transform success |
| `mapErr` | `(r, e => f) => Result<T, F>` | Normalize to `AppError` |
| `andThen` | `(r, t => Result<U, E2>) => Result<U, E \| E2>` | Chain (flatMap) — the Go “early return” in pipelines |
| `unwrapOr` | `(r, default) => T` | UI / non-critical paths |
| `match` | `(r, { ok, err }) => R` | Exhaustive branch |
| `fromThrowable` | `(fn, mapError?) => Result<T, E>` | Wrap sync `throw` APIs |
| `fromPromise` | `(p, mapError?) => Promise<Result<T, E>>` | Wrap async `throw` / reject — **this replaces catchAsync** |
| `tryAsync` | alias of `fromPromise` with nicer name for app code | DX |

Example (no try/catch in business code):

```ts
async function loadUser(id: string): Promise<Result<User, AppError>> {
  const row = await fromPromise(
    db.user.find(id),
    (cause) => appError("DB_ERROR", { status: 500, cause }),
  );
  if (!row.ok) return row;
  if (!row.value) return err(appError(ErrorCodes.NOT_FOUND, { detail: "user missing" }));
  return ok(row.value);
}
```

### Tier B — ship soon (common composition)

| Helper | Why |
|--------|-----|
| `andTee` / `tap` | Side effects on success (log) without changing value |
| `orElse` | Fallback Result / recover |
| `combine` | `Result<T, E>[]` → `Result<T[], E>` (first error) |
| `combineAll` | Collect all errors (validation-style) |
| `flatten` | `Result<Result<T, E>, E>` → `Result<T, E>` |
| `toThrowable` | `Result` → throw on err (escape hatch into throw-based HTTP) |
| `attempt` | sync alias of `fromThrowable` |

### Tier C — optional / later

| Helper | Note |
|--------|------|
| Full `ResultAsync` class with method chaining | neverthrow’s strength; we can stay with `Promise<Result<>>` + free functions to keep core tiny |
| `safeTry` / generators (`yield*`) | Nice DX; more complex; revisit after Tier A/B |
| `Option` / `Some`/`None` | Separate proposal; don’t mix into Result v1 |
| `unwrap` (throw on err) | Useful in tests only; easy to misuse in prod — export as `unwrapOrThrow` with loud name |

### Tier D — skip (for ZwenTS)

| Idea | Why skip |
|------|----------|
| `catchAsync(fn)` Express wrapper | Encourages throw-centric handlers |
| Tuple `[T, Error]` Go port literally | Poor TS ergonomics |
| Retry / timeout / Schedule | Belongs in jobs/OTel recipes, not Result core |
| Railway `pipe` mega-kit | fp-ts/Effect territory |

---

## 5. HTTP integration helpers (framework-specific — we write these)

Not in neverthrow; these are ZwenTS-specific and high value:

| Helper | Behavior |
|--------|----------|
| `resultToResponse(result)` | `ok` → `json(value)`; `err` + `AppError` → `problemJson` |
| `unwrapResult(result)` | throw `AppError` if err (for handlers that still use throw) |
| Handler convention | `handler` may return `T \| Result<T, AppError>`; core/http normalizes |

Recommended default for v1 docs:

- Services return `Promise<Result<T, AppError>>`
- Route handlers either `match` to body or `return unwrapResult(await service())` until auto-unwrap lands

---

## 6. Implementation plan (when we build it)

1. Extend `@zwents/core/lib/result.ts` with Tier A (plain functions, no classes).
2. Tests + short recipe in `docs/` (Go ↔ Result cheatsheet).
3. Example service in `examples/minimal` using `fromPromise` + early `if (!r.ok) return r`.
4. Optional: `resultToResponse` in core or http.
5. **Do not** add neverthrow as dependency unless a future RFC argues ecosystem pressure.

Rough size target: **&lt; ~150 LOC** helpers + tests — if it grows toward neverthrow’s surface, stop and re-evaluate a peer dependency.

---

## 7. Licensing note (if we copy)

neverthrow is **MIT**. If we adapt specific helper implementations, keep a short `NOTICE` / comment “inspired by neverthrow” in `result.ts`. Prefer reimplementing from the table above rather than vendoring the package.

---

## 8. Decision checklist (for you)

- [x] Bless `{ ok, value } | { ok: false, error }` as the only Result shape  
- [x] Tier A helpers in `@zwents/core` (no new dependency)  
- [x] `fromPromise` / `tryAsync` as the anti-`catchAsync`  
- [x] Default `E` to `AppError` in docs/examples  
- [x] Defer `ResultAsync` class and `safeTry` generators  
- [x] Promote to **RFC 0006** when implementing → [RFC 0006](../rfcs/0006-result-helpers.md)  

---

## 9. Minimal “Go cheat sheet”

| Go | ZwenTS Result |
|----|----------------|
| `v, err := f()` | `const r = await f()` |
| `if err != nil { return err }` | `if (!r.ok) return r` |
| `return v, nil` | `return ok(v)` |
| `errors.Is` / wrap | `mapErr` + `AppError` cause |
| `must(f())` in tests | `unwrapOrThrow(r)` |
