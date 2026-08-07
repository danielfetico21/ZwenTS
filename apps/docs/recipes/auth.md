# Auth (production)

`@zwents/auth` verifies bearers; you own JWT/sessions.

Demo `POST /auth/token` in examples is **fail-closed** (`ALLOW_DEMO_AUTH=1` only for local demos). Never enable in production.

```ts
import { bearerAuth, requireAuth } from "@zwents/auth";
import { createRemoteJWKSet, jwtVerify } from "jose";

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
        return { userId, roles: ["user"] };
      } catch {
        return null;
      }
    },
  }),
);

// Protect routes with requireAuth() / authorize(...)
```

Full checklist: monorepo `docs/auth-recipe.md`.
