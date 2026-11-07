import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DOCUMENT_KINDS,
  DocumentValidationError,
  MESSAGE_KINDS,
  type MessageOf,
  parseDocument,
  parsePlot,
  SchemaVersionError,
  serialiseDocument,
  validateDocument,
} from "../src/index.js";
import schema from "../src/generated/debrief.schema.json" with { type: "json" };
import { refsWithoutSiblings } from "../scripts/passes.mjs";

const fixtures = join(__dirname, "../../../schemas/fixtures");
const read = (folder: string) =>
  DOCUMENT_KINDS.flatMap((kind) => {
    const dir = join(fixtures, kind, folder);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => [`${kind}/${name}`, kind, readFileSync(join(dir, name), "utf8")] as const);
  });

describe("valid fixtures", () => {
  it.each(read("valid"))("%s parses and round-trips losslessly", (_id, kind, text) => {
    const document = parseDocument(kind, text);
    expect(JSON.parse(serialiseDocument(kind, document))).toEqual(JSON.parse(text));
  });
});

describe("structurally invalid fixtures", () => {
  it.each(read("invalid/schema"))("%s is rejected", (_id, kind, text) => {
    expect(() => parseDocument(kind, text)).toThrow();
  });
});

describe("semantic fixtures", () => {
  // Rules LinkML cannot express are Python's job (PRN-03); TypeScript accepts these.
  it.each(read("invalid/semantic"))("%s passes structural validation", (_id, kind, text) => {
    expect(() => parseDocument(kind, text)).not.toThrow();
  });
});

describe("schema version", () => {
  const plot = read("valid").find(([id]) => id === "plot/minimal-track.json")![2];

  it("refuses a newer schema version, naming it", () => {
    const document = JSON.parse(plot);
    document.schema_version = "99.0.0";
    expect(() => parsePlot(JSON.stringify(document))).toThrow(SchemaVersionError);
    expect(() => parsePlot(JSON.stringify(document))).toThrow(/99\.0\.0/);
  });

  it("reports problems by path", () => {
    const [, , text] = read("invalid/schema").find(([id]) => id === "plot/microsecond-timestamp.json")!;
    try {
      parsePlot(text);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(DocumentValidationError);
      expect((e as DocumentValidationError).problems.join()).toContain("/features/0/properties/times/0");
    }
  });
});

describe("webview messages, one class per kind (CON-08)", () => {
  const problems = (message: unknown) => {
    try {
      validateDocument("webview_message", message);
      return [];
    } catch (e) {
      return (e as DocumentValidationError).problems;
    }
  };

  it("lists every kind once, each with its own class", () => {
    const defs = schema.$defs as unknown as Record<string, { oneOf: { $ref: string }[]; properties: { kind: { const?: string } } }>;
    const kinds = defs.WebviewMessage.oneOf.map((o) => defs[o.$ref.split("/").pop()!].properties.kind.const);
    expect(kinds).toEqual(MESSAGE_KINDS);
  });

  it("reports only the problems of the message's own kind, as Python does", () => {
    expect(problems({ kind: "edit_track", feature_id: "t" })).toEqual(["<root>: must have required property 'track_edit'"]);
    expect(problems({ kind: "ready", plot_title: "x" })).toEqual(["<root>: must NOT have additional properties"]);
    expect(problems({ kind: "explode" })).toHaveLength(1);
    expect(problems({ kind: "ready" })).toEqual([]);
  });

  it("narrows on kind", () => {
    const message = validateDocument("webview_message", { kind: "form_busy", message: "Running" });
    const text: string = message.kind === "form_busy" ? message.message : "";
    const busy: MessageOf<"form_busy" | "form_error"> = { kind: "form_error", message: text };
    expect(busy.message).toBe("Running");
  });
});

describe("the generator's passes for TypeScript", () => {
  it("writes a member that is a $ref with a description as anyOf the one $ref, in a union's classes only", () => {
    const defs = {
      U: { discriminator: { propertyName: "kind" }, oneOf: [{ $ref: "#/$defs/M" }] },
      M: { properties: { a: { $ref: "#/$defs/A", description: "d" }, b: { $ref: "#/$defs/A" } } },
      N: { properties: { a: { $ref: "#/$defs/A", description: "d" } } },
    };
    const out = refsWithoutSiblings(defs);
    expect(out.M.properties).toEqual({ a: { description: "d", anyOf: [{ $ref: "#/$defs/A" }] }, b: { $ref: "#/$defs/A" } });
    expect(out.N).toEqual(defs.N);
  });
});
