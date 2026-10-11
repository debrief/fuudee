import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parsePlot,
  PlotValidationError,
  SCHEMA_VERSION,
  SchemaVersionError,
  serialisePlot,
} from "../src/index.js";

const fixtures = join(__dirname, "../../../schemas/fixtures");
const read = (folder: string) =>
  readdirSync(join(fixtures, folder))
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => [name, readFileSync(join(fixtures, folder, name), "utf8")] as const);

describe("valid fixtures", () => {
  it.each(read("valid"))("%s parses and round-trips losslessly", (_name, text) => {
    const plot = parsePlot(text);
    expect(plot.schema_version).toBe(SCHEMA_VERSION);
    expect(JSON.parse(serialisePlot(plot))).toEqual(JSON.parse(text));
  });
});

describe("invalid fixtures", () => {
  it.each(read("invalid/schema"))("%s is rejected", (_name, text) => {
    expect(() => parsePlot(text)).toThrow();
  });

  it("refuses a newer schema version, naming it", () => {
    const document = JSON.parse(read("valid")[0][1]);
    document.schema_version = "99.0.0";
    expect(() => parsePlot(JSON.stringify(document))).toThrow(SchemaVersionError);
    expect(() => parsePlot(JSON.stringify(document))).toThrow(/99\.0\.0/);
  });

  it("reports problems by path", () => {
    const [, text] = read("invalid/schema").find(([n]) => n === "microsecond-timestamp.json")!;
    try {
      parsePlot(text);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(PlotValidationError);
      expect((e as PlotValidationError).problems.join()).toContain("/features/0/properties/times/0");
    }
  });
});
