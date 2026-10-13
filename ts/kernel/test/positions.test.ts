import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, formatPosition, parsePosition, PositionError } from "../src/index.js";

const vectors = join(__dirname, "../../../schemas/vectors");
const { cases } = JSON.parse(readFileSync(join(vectors, "positions.json"), "utf8")) as {
  cases: { name: string; input: string; expected?: [number, number]; error?: boolean }[];
};

describe("shared position vectors", () => {
  it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    if (c.error) {
      expect(() => parsePosition(c.input)).toThrow(PositionError);
      return;
    }
    const position = parsePosition(c.input);
    expect(position.longitude).toBeCloseTo(c.expected![0], 9);
    expect(position.latitude).toBeCloseTo(c.expected![1], 9);
  });
});

describe("reading what Debrief writes", () => {
  it.each(["dd", "dm", "dms"] as const)("%s reads back", (notation) => {
    const settings = { ...DEFAULT_SETTINGS, position_notation: notation };
    for (const position of [
      { longitude: -4.120166, latitude: 50.335333 },
      { longitude: 151.2153, latitude: -33.8568 },
    ]) {
      const read = parsePosition(formatPosition(position, settings));
      expect(Math.abs(read.longitude - position.longitude)).toBeLessThan(6e-4);
      expect(Math.abs(read.latitude - position.latitude)).toBeLessThan(6e-4);
    }
  });

  it("says what to type", () => {
    expect(() => parsePosition("somewhere")).toThrow("50°20.120'N 004°07.210'W");
  });
});
