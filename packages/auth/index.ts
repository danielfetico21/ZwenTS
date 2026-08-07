export {
  authorize,
  bearerAuth,
  requireAuth,
} from "./lib/middleware.js";
export type {
  BearerAuthOptions,
  Policy,
  VerifyBearer,
} from "./lib/middleware.js";
export {
  SECURITY_META,
  getSecurityMeta,
  withSecurityMeta,
} from "./lib/security-meta.js";
export type {
  MiddlewareSecurityMeta,
  OpenApiHttpSecurityScheme,
  OpenApiSecurityRequirement,
  OpenApiSecurityScheme,
  SecurityAwareMiddleware,
} from "./lib/security-meta.js";
