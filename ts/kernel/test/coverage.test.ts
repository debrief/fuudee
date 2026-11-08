/**
 * Collation's logic in TypeScript (CAP-05, CAP-08, CAP-09): spans, platform names and
 * periods held to the vectors Python is held to (schemas/vectors/collation.json).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { periods, platformKey, spans } from "../src/index.js";

const repo = path.resolve(__dirname, "../../..");
const vectors = JSON.parse(readFileSync(path.join(repo, "schemas/vectors/collation.json"), "utf8")) as {
  spans: { name: string; times: string[]; spans: [string, string][] }[];
  platform_keys: { name: string; key: string }[];
  periods: { name: string; sources: [string, string][][]; periods: { start: string; end: string; sources: number[] }[] }[];
};
const iso = (ms: number) => new Date(ms).toISOString();

describe("spans, as Python works them out (schemas/vectors/collation.json)", () => {
  it.each(vectors.spans)("$name", (c) => {
    expect(spans(c.times.map(Date.parse)).map(([a, b]) => [iso(a), iso(b)])).toEqual(c.spans);
  });
});

describe("platform names, as Python matches them", () => {
  it.each(vectors.platform_keys)("$name", (c) => expect(platformKey(c.name)).toBe(c.key));
});

describe("periods, as Python cuts them", () => {
  it.each(vectors.periods)("$name", (c) => {
    const got = periods(c.sources.map((s) => s.map(([a, b]) => [Date.parse(a), Date.parse(b)] as [number, number])));
    expect(got.map((p) => ({ start: iso(p.start), end: iso(p.end), sources: p.sources }))).toEqual(c.periods);
  });
});
