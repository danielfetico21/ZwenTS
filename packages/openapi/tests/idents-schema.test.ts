import { describe, expect, it } from "vitest";
import {
  inlineLocalRefs,
  localDefs,
  normalizeComponentRef,
  rewriteSchemaRefs,
  sanitizeIdent,
  uniqueIdent,
} from "../index.js";

describe("idents", () => {
  it("sanitizeIdent strips junk, rejects empty, and prefixes leading digits", () => {
    expect(sanitizeIdent("Hello_World")).toBe("Hello_World");
    expect(sanitizeIdent("!!!", "Fallback")).toBe("Fallback");
    expect(sanitizeIdent("123abc", "N")).toBe("N123abc");
  });

  it("uniqueIdent suffixes until unused", () => {
    const used = new Set<string>();
    expect(uniqueIdent("Item", used)).toBe("Item");
    expect(uniqueIdent("Item", used)).toBe("Item2");
    expect(uniqueIdent("Item", used)).toBe("Item3");
  });
});

describe("json-schema helpers", () => {
  it("normalizeComponentRef rewrites shared, defs, and leaves others", () => {
    expect(
      normalizeComponentRef(
        "#/components/schemas/__shared#/$defs/NoteId",
      ),
    ).toBe("#/components/schemas/NoteId");
    expect(
      normalizeComponentRef(
        "#/components/schemas/__shared#/definitions/NoteId",
      ),
    ).toBe("#/components/schemas/NoteId");
    expect(normalizeComponentRef("#/$defs/Local")).toBe(
      "#/components/schemas/Local",
    );
    expect(normalizeComponentRef("#/definitions/Legacy")).toBe(
      "#/components/schemas/Legacy",
    );
    expect(normalizeComponentRef("#/components/schemas/Keep")).toBe(
      "#/components/schemas/Keep",
    );
  });

  it("localDefs reads $defs or definitions", () => {
    expect(localDefs({ $defs: { A: { type: "string" } } })).toEqual({
      A: { type: "string" },
    });
    expect(localDefs({ definitions: { B: { type: "number" } } })).toEqual({
      B: { type: "number" },
    });
    expect(localDefs({ type: "string" })).toEqual({});
  });

  it("inlineLocalRefs walks arrays and unknown refs", () => {
    const defs = { Inner: { type: "string" } };
    expect(
      inlineLocalRefs(
        [{ $ref: "#/$defs/Inner" }, { type: "number" }],
        defs,
      ),
    ).toEqual([{ type: "string" }, { type: "number" }]);

    expect(
      inlineLocalRefs({ $ref: "#/$defs/Missing" }, defs),
    ).toEqual({ $ref: "#/components/schemas/Missing" });

    expect(
      rewriteSchemaRefs({
        anyOf: [{ $ref: "#/$defs/X" }, { type: "null" }],
      }),
    ).toEqual({
      anyOf: [{ $ref: "#/components/schemas/X" }, { type: "null" }],
    });
  });
});
