import type { Db } from "./db.js";

export type TokenService = {
  issue: (userId: string) => Promise<{ token: string }>;
  resolveUserId: (token: string) => Promise<string | null>;
};

/** Demo token issuer — replace with JWT/session store in production. */
export function createTokenService(db: Db): TokenService {
  return {
    async issue(userId) {
      const token = `tok_${crypto.randomUUID().replaceAll("-", "")}`;
      db.tokens.set(token, userId);
      return { token };
    },
    async resolveUserId(token) {
      return db.tokens.get(token) ?? null;
    },
  };
}
