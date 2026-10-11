import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DOCUMENT_KINDS,
  DocumentValidationError,
  parseDocument,
  parsePlot,
  SchemaVersionError,
  serialiseDocument,
} from "../src/index.js";

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
