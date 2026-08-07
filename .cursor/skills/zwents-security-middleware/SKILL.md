---
name: zwents-security-middleware
description: >-
  Implement safe ZwenTS HTTP security middleware (CORS, headers, request-id,
  rate limit, idempotency) without header injection, overly permissive CORS,
  or shared mutable request state. Use when writing @zwents/security,
  @zwents/ratelimit, auth edge hardening, or reviewing security middleware.
---

# ZwenTS security middleware

## Defaults

- **Deny by default** for CORS: no `Access-Control-Allow-Origin: *` when credentials are enabled.
- Reflect only **explicitly allowed** origins (exact match or vetted predicate). Never reflect arbitrary `Origin`.
- Echo `Vary: Origin` when the ACAO value varies by request.
- Security headers: sensible Helmet-like defaults; allow opt-out per header.
- Request IDs: accept client id only if it matches a strict charset + max length; otherwise generate. Never copy raw header bytes into response without validation.

## Header safety

- Reject or ignore values containing `\\r`, `\\n`, or NUL.
- Cap length (e.g. request-id ≤ 128).
- Normalize header names to lowercase in `AppResponse.headers`.
- Merge via `ctx.responseHeaders` (core) so error responses get the same headers.

## CORS specifics

- Handle `OPTIONS` preflight in middleware: respond `204`, do not require a route.
- Allow-Methods / Allow-Headers: configure explicitly; optional reflect of `Access-Control-Request-Headers` only when each token is in an allowlist.
- `Max-Age` configurable; default modest (e.g. 600).
- Credentials + `*` is a bug — throw at middleware construction time.

## Concurrency

- No request-scoped Maps on the module. Rate limit / idempotency stores must be injectable and tested under `Promise.all`.
- Document single-node vs shared-store semantics; in-memory is not safe across processes.

## Threat notes to test

| Risk | Test |
|------|------|
| Origin reflection | Disallowed origin → no ACAO (or error) |
| Credentials + `*` | Construction throws |
| CR LF in request-id | Ignored; new UUID used |
| Preflight without route | 204 + CORS headers, not 404 |
| Error path | 404/401 still include security/CORS headers |
