import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  fixed,
  formatBearing,
  formatDepth,
  formatPosition,
  formatQuantity,
  formatRange,
  formatRelativeBearing,
  formatTime,
  type FormatSettings,
} from "../src/index.js";

const vectors = join(__dirname, "../../../schemas/vectors");
const { cases } = JSON.parse(readFileSync(join(vectors, "formatting.json"), "utf8")) as {
  cases: { name: string; settings: Partial<FormatSettings>; op: string; input: Record<string, number | string>; expected: string }[];
};

const parseUtc = (text: string) => Date.parse(text);

describe("shared formatting vectors", () => {
  it("defaults match the shared defaults", () => {
    expect(DEFAULT_SETTINGS).toEqual(JSON.parse(readFileSync(join(vectors, "format-defaults.json"), "utf8")));
  });

  it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const settings = { ...DEFAULT_SETTINGS, ...c.settings };
    const input = c.input;
    const quantity = { value: input.value as number, unit: input.unit as string };
    const formats: Record<string, () => string> = {
      quantity: () => formatQuantity(quantity, settings),
      range: () => formatRange(quantity, settings),
      bearing: () => formatBearing(quantity, settings),
      relative_bearing: () => formatRelativeBearing(quantity, settings),
      depth: () => formatDepth(quantity, settings),
      position: () => formatPosition({ longitude: input.longitude as number, latitude: input.latitude as number }, settings),
      time: () => formatTime(parseUtc(input.utc as string), settings),
    };
    const result = formats[c.op]();
    expect(result).toBe(c.expected);
  });
});

describe("rounding", () => {
  it.each([
    [2.5, 0, "3"],
    [-2.5, 0, "-3"],
    [0.125, 2, "0.13"],
    [1.005, 2, "1.00"],
    [-0.04, 1, "0.0"],
  ] as const)("fixed(%s, %s) is %s", (value, decimals, expected) => {
    expect(fixed(value, decimals)).toBe(expected);
  });

  it("refuses a local-time date-time group", () => {
    expect(() => formatTime(0, { ...DEFAULT_SETTINGS, time_style: "dtg", time_zone: "Europe/London" })).toThrow();
  });
});
