/** Classic compiler API — TS 7.0 removed it from `typescript` until 7.1. */
import type ts from "@typescript/typescript6";

export class WireCodegenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WireCodegenError";
  }
}

const SAFE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function assertSafeIdent(
  name: string,
  label: string,
  where?: string,
): void {
  if (!SAFE_IDENT.test(name)) {
    throw new WireCodegenError(
      `${where ? `${where}: ` : ""}${label} "${name}" must be a valid TypeScript identifier`,
    );
  }
}

export function fmtPos(sourceFile: ts.SourceFile, node: ts.Node): string {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  return `${sourceFile.fileName}:${line + 1}:${character + 1}`;
}
