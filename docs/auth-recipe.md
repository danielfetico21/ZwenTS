# Auth recipe (production)

`@zwents/auth` only verifies **bearers** you supply. Token minting, passwords, refresh, and IdP integration stay in **your app**.

## Do not ship demo minting

Examples expose `POST /auth/token` behind `ALLOW_DEMO_AUTH=1`. That gate is **fail-closed**. Never set it in production.

## JWT verify (recommended)

```ts
import { createRemoteJWKSet, jwtVerify } from "jose"; // app dependency
import { bearerAuth, requireAuth } from "@zwents/auth";

const jwks = createRemoteJWKSet(new URL(process.env.JWKS_URL!));

app.use(
  bearerAuth({
    required: false,
    verify: async (token) => {
      try {
        const { payload } = await jwtVerify(token, jwks, {
          issuer: process.env.JWT_ISSUER,
          audience: process.env.JWT_AUDIENCE,
        });
        const userId = String(payload.sub ?? "");
        if (!userId) return null;
        const roles = Array.isArray(payload["roles"])
          ? payload["roles"].map(String)
          : ["user"];
        return { userId, roles };
      } catch {
        return null; // → 401 when requireAuth() is on the route
      }
    },
  }),
);

app.route(
  route({
    method: "GET",
    path: "/me",
    middleware: [requireAuth()],
    // ...
  }),
);
```

## Opaque session tokens

Same pattern as `examples/notes-api` `tokens.resolveUserId`, but backed by Redis/Postgres with TTL + revoke:

```ts
verify: async (token, ctx) => {
  const session = await ctx.services.sessions.get(token);
  if (!session || session.expiresAt < Date.now()) return null;
  return { userId: session.userId, roles: session.roles };
},
```

## Checklist

| Item | Prod |
|------|------|
| Demo `/auth/token` | Off (`ALLOW_DEMO_AUTH` unset) |
| HTTPS / secure cookies (if cookie session) | Required at edge |
| Token expiry + revoke | Required |
| `requireAuth` / `authorize` on mutating routes | Required |
| CORS allowlist (not reflect-all) | Required |

See also: [security headers / CORS](./TODO-production.md) Phase 2 #22, RFC 0004 Problem Details for 401/403 bodies.
