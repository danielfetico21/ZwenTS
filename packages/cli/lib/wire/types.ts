export type WireProviderAst = {
  key: string;
  factoryName: string;
  deps: string[];
  line: number;
};

export type ImportBinding = {
  moduleSpecifier: string;
  /** Name to import (`createDb` or `default`). */
  importedName: string;
  isDefault: boolean;
};

export type WireGraphAst = {
  providers: WireProviderAst[];
  seeds: string[];
  expose: string[] | null;
  functionName: string;
  /** Local binding name → import info from the wire file. */
  imports: Map<string, ImportBinding>;
  sourcePath: string;
};

export type GenerateWireOptions = {
  from: string;
  out: string;
};
