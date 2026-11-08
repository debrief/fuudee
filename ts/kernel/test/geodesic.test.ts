/**
 * A track's position at a time, as the map places it and the Tote measures it (SUB-03),
 * held to the vectors debrief_kernel is (schemas/vectors/track-positions.json).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { positionAt, type LonLat } from "../src/index.js";

const repo = path.resolve(__dirname, "../../..");
const read = (file: string) => JSON.parse(readFileSync(path.join(repo, file), "utf8"));

describe("the map places a track at current time where the Tote measures it (SUB-03)", () => {
  const { cases } = read("schemas/vectors/track-positions.json") as {
    cases: { name: string; coordinates: LonLat[]; times: string[]; samples: { at: string; expected: LonLat | null }[] }[];
  };
  it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const times = c.times.map(Date.parse);
    for (const sample of c.samples) {
      const found = positionAt(c.coordinates, times, Date.parse(sample.at));
      if (sample.expected === null) {
        expect(found, sample.at).toBeUndefined();
        continue;
      }
      // Longitude the same place on the globe: ±180 are one meridian.
      const dLon = ((found![0] - sample.expected[0] + 540) % 360) - 180;
      expect(Math.abs(dLon), sample.at).toBeLessThan(1e-9);
      expect(found![1]).toBeCloseTo(sample.expected[1], 9);
    }
  });
});
