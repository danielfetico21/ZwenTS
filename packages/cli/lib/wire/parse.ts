import fs from "node:fs/promises";
import path from "node:path";
/** Classic compiler API — TS 7.0 removed it from `typescript` until 7.1. */
import ts from "@typescript/typescript6";
import { assertSafeIdent, fmtPos, WireCodegenError } from "./errors.js";
import type { ImportBinding, WireGraphAst, WireProviderAst } from "./types.js";

export function parseWireSource(
  sourceText: string,
  sourcePath: string,
): WireGraphAst {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const imports = collectImports(sourceFile);
  const call = findDefineWireCall(sourceFile);
  if (!call) {
    throw new WireCodegenError(
      `${sourcePath}: no defineWire(...) call found (expected export default defineWire({...}))`,
    );
  }

  const arg = call.arguments[0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) {
    throw new WireCodegenError(
      `${fmtPos(sourceFile, call)}: defineWire(...) expects an object literal`,
    );
  }

  const options = parseDefineWireObject(arg, sourceFile);
  for (const provider of options.providers) {
    if (!imports.has(provider.factoryName)) {
      throw new WireCodegenError(
        `${sourcePath}:${provider.line}: factory "${provider.factoryName}" must be imported (local factories are not emitted)`,
      );
    }
  }

  return {
    ...options,
    imports,
    sourcePath,
  };
}

export async function parseWireFile(filePath: string): Promise<WireGraphAst> {
  const abs = path.resolve(filePath);
  const text = await fs.readFile(abs, "utf8");
  return parseWireSource(text, abs);
}

function collectImports(sourceFile: ts.SourceFile): Map<string, ImportBinding> {
  const imports = new Map<string, ImportBinding>();
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    if (!stmt.importClause || stmt.moduleSpecifier.kind !== ts.SyntaxKind.StringLiteral) {
      continue;
    }
    const moduleSpecifier = (stmt.moduleSpecifier as ts.StringLiteral).text;
    const clause = stmt.importClause;
    if (clause.name) {
      imports.set(clause.name.text, {
        moduleSpecifier,
        importedName: "default",
        isDefault: true,
      });
    }
    const named = clause.namedBindings;
    if (named && ts.isNamedImports(named)) {
      for (const el of named.elements) {
        const local = el.name.text;
        const importedName = el.propertyName?.text ?? local;
        imports.set(local, {
          moduleSpecifier,
          importedName,
          isDefault: false,
        });
      }
    }
  }
  return imports;
}

function findDefineWireCall(sourceFile: ts.SourceFile): ts.CallExpression | undefined {
  let found: ts.CallExpression | undefined;

  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (node.expression.text === "defineWire") {
        found = node;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
}

function parseDefineWireObject(
  obj: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
): Omit<WireGraphAst, "imports" | "sourcePath"> {
  const props = new Map<string, ts.Expression>();
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) {
      throw new WireCodegenError(
        `${fmtPos(sourceFile, prop)}: only property assignments are supported in defineWire`,
      );
    }
    const name = propertyName(prop.name);
    if (!name) {
      throw new WireCodegenError(
        `${fmtPos(sourceFile, prop)}: unsupported property name`,
      );
    }
    props.set(name, prop.initializer);
  }

  let providersExpr: ts.ObjectLiteralExpression;
  let seeds: string[] = [];
  let expose: string[] | null = null;
  let functionName = "buildContainer";

  if (props.has("providers")) {
    const providersInit = props.get("providers")!;
    if (!ts.isObjectLiteralExpression(providersInit)) {
      throw new WireCodegenError(
        `${fmtPos(sourceFile, providersInit)}: providers must be an object literal`,
      );
    }
    providersExpr = providersInit;
    if (props.has("seeds")) {
      seeds = parseStringArray(props.get("seeds")!, sourceFile, "seeds");
    }
    if (props.has("expose")) {
      expose = parseStringArray(props.get("expose")!, sourceFile, "expose");
    }
    if (props.has("functionName")) {
      const fn = props.get("functionName")!;
      if (!ts.isStringLiteral(fn)) {
        throw new WireCodegenError(
          `${fmtPos(sourceFile, fn)}: functionName must be a string literal`,
        );
      }
      functionName = fn.text;
      assertSafeIdent(
        functionName,
        "functionName",
        fmtPos(sourceFile, fn),
      );
    }
  } else {
    providersExpr = obj;
  }

  const providers = parseProvidersObject(providersExpr, sourceFile);
  if (providers.length === 0) {
    throw new WireCodegenError(
      `${fmtPos(sourceFile, providersExpr)}: defineWire providers map is empty`,
    );
  }

  const seen = new Set<string>();
  for (const p of providers) {
    if (seen.has(p.key)) {
      throw new WireCodegenError(
        `${sourceFile.fileName}:${p.line}: duplicate provider key "${p.key}"`,
      );
    }
    seen.add(p.key);
  }

  for (const seed of seeds) {
    assertSafeIdent(seed, "seed");
    if (seen.has(seed)) {
      throw new WireCodegenError(
        `seed "${seed}" conflicts with provider key "${seed}"`,
      );
    }
  }

  if (expose) {
    for (const key of expose) {
      assertSafeIdent(key, "expose entry");
    }
  }

  assertSafeIdent(functionName, "functionName");

  return { providers, seeds, expose, functionName };
}

function parseProvidersObject(
  obj: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
): WireProviderAst[] {
  const providers: WireProviderAst[] = [];
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) {
      throw new WireCodegenError(
        `${fmtPos(sourceFile, prop)}: provider entries must be property assignments`,
      );
    }
    const key = propertyName(prop.name);
    if (!key) {
      throw new WireCodegenError(
        `${fmtPos(sourceFile, prop)}: unsupported provider key`,
      );
    }
    assertSafeIdent(key, "provider key", fmtPos(sourceFile, prop));
    // Skip option keys if someone used flat form incorrectly with options
    if (
      key === "providers" ||
      key === "seeds" ||
      key === "expose" ||
      key === "functionName"
    ) {
      throw new WireCodegenError(
        `${fmtPos(sourceFile, prop)}: use defineWire({ providers, seeds?, expose? }) for options`,
      );
    }
    const wireCall = prop.initializer;
    if (!ts.isCallExpression(wireCall) || !ts.isIdentifier(wireCall.expression)) {
      throw new WireCodegenError(
        `${fmtPos(sourceFile, prop)}: provider "${key}" must be wire(factory, deps?)`,
      );
    }
    if (wireCall.expression.text !== "wire") {
      throw new WireCodegenError(
        `${fmtPos(sourceFile, prop)}: provider "${key}" must be wire(factory, deps?)`,
      );
    }
    const factoryArg = wireCall.arguments[0];
    if (!factoryArg || !ts.isIdentifier(factoryArg)) {
      throw new WireCodegenError(
        `${fmtPos(sourceFile, prop)}: wire() first argument must be a factory identifier`,
      );
    }
    let deps: string[] = [];
    if (wireCall.arguments[1]) {
      deps = parseStringArray(wireCall.arguments[1], sourceFile, `deps for "${key}"`);
    }
    for (const dep of deps) {
      assertSafeIdent(dep, `dep for "${key}"`, fmtPos(sourceFile, prop));
    }
    assertSafeIdent(
      factoryArg.text,
      "factory name",
      fmtPos(sourceFile, factoryArg),
    );
    const { line } = sourceFile.getLineAndCharacterOfPosition(prop.getStart(sourceFile));
    providers.push({
      key,
      factoryName: factoryArg.text,
      deps,
      line: line + 1,
    });
  }
  return providers;
}

function parseStringArray(
  expr: ts.Expression,
  sourceFile: ts.SourceFile,
  label: string,
): string[] {
  let node: ts.Expression = expr;
  // allow `as const`
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
    node = node.expression;
  }
  if (!ts.isArrayLiteralExpression(node)) {
    throw new WireCodegenError(
      `${fmtPos(sourceFile, expr)}: ${label} must be an array of string literals`,
    );
  }
  return node.elements.map((el) => {
    if (!ts.isStringLiteral(el) && !ts.isNoSubstitutionTemplateLiteral(el)) {
      throw new WireCodegenError(
        `${fmtPos(sourceFile, el)}: ${label} entries must be string literals`,
      );
    }
    return el.text;
  });
}

function propertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name)) return name.text;
  return undefined;
}
