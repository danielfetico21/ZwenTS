import type { HttpMethod } from "@zwents/core";

export type PathParamStyle = "colon" | "brace";

/** Split a path into PascalCase name tokens (`ById` for params). */
export function pathTokens(
  path: string,
  paramStyle: PathParamStyle,
): string[] {
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => {
      if (paramStyle === "colon" && part.startsWith(":")) {
        return `By${pascalCase(part.slice(1))}`;
      }
      if (paramStyle === "brace") {
        const match = /^\{([^}]+)\}$/.exec(part);
        if (match?.[1]) {
          return `By${pascalCase(match[1])}`;
        }
      }
      return pascalCase(part);
    });
}

export function pascalCase(value: string): string {
  return value
    .replace(/[^A-Za-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("");
}

/** OpenAPI component / schema hint: `GetUsersByIdResponse`. */
export function schemaNameHint(
  method: HttpMethod,
  path: string,
  role: string,
): string {
  return `${pascalCase(method.toLowerCase())}${pathTokens(path, "colon").join("")}${role}`;
}

/**
 * Fetch-client method name from an OpenAPI path item.
 * Prefers `operationId`; otherwise `getUsersById`-style from brace paths.
 */
export function operationName(
  method: string,
  path: string,
  operation: Record<string, unknown>,
): string {
  if (typeof operation["operationId"] === "string") {
    return operation["operationId"];
  }
  const rest = pathTokens(path, "brace").join("") || "Root";
  return `${method}${rest}`;
}
