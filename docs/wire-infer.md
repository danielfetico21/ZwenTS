# Wire: infer deps from TypeScript parameter types

**Status:** deferred (Phase 2 #27 / RFC 0005 follow-up).

Today `wire(factory, deps)` requires **explicit** dependency name arrays. Codegen topo-sorts those names — it does **not** read TypeScript parameter types.

Inferring deps from TS types needs a type-checker API (e.g. `ts-morph` / `typescript` program) and careful handling of optional params, interfaces, and renamed imports. That stays **out of 0.1.x** to keep the CLI light.

Until then:

```ts
wire(createNotesService, ["notesRepo"]), // explicit names required
```
