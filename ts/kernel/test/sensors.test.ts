/**
 * Sensors and their cuts (CAP-22): where the map draws a cut from and to, which side a
 * bearing is on and which bearing keeping port or starboard keeps, held to the vectors
 * debrief_kernel.sensors is held to (schemas/vectors/sensor-cuts.json).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cutEnd, cutPlace, DEFAULT_LENGTH_CAP_M, defaultLengthM, drawnBearings, keptFor, relativeBearing, sideOf, type Kept, type LonLat } from "../src/index.js";

const repo = path.resolve(__dirname, "../../..");
const vectors = JSON.parse(readFileSync(path.join(repo, "schemas/vectors/sensor-cuts.json"), "utf8")) as {
  relative: { course: number; bearing: number; relative: number; side: string }[];
  default_length: { width_m: number; height_m: number; expected_m: number }[];
  cases: {
    name: string;
    host: { coordinates: LonLat[]; times: string[]; courses?: number[] };
    sensor?: { array_offset_m: number; array_mode: "worm_in_hole" | "plain" };
    cuts: {
      time: string;
      bearing: number;
      ambiguous_bearing?: number;
      resolved?: string;
      range_m?: number;
      length_m?: number;
      origin?: LonLat;
      course?: number;
      expected: { origin: LonLat | null; course: number | null; side: string | null; lines?: { which: Kept; end: LonLat }[]; keep_port: Kept | null; keep_starboard: Kept | null };
    }[];
  }[];
};

function samePlace(found: LonLat | undefined, expected: LonLat | null, what: string): void {
  if (expected === null) {
    expect(found, what).toBeUndefined();
    return;
  }
  const dLon = ((found![0] - expected[0] + 540) % 360) - 180; // ±180 are one meridian
  expect(Math.abs(dLon), what).toBeLessThan(1e-9);
  expect(found![1], what).toBeCloseTo(expected[1], 9);
}

describe("sides as legacy Debrief's relBearing tells them, every case of its own test", () => {
  it.each(vectors.relative.map((c) => [`${c.course}/${c.bearing}`, c] as const))("%s", (_name, c) => {
    expect(relativeBearing(c.course, c.bearing)).toBeCloseTo(c.relative, 12);
    expect(sideOf(c.course, c.bearing)).toBe(c.side);
  });
  it("draws a cut without a range past the edge of the view, at most five degrees of arc", () => {
    for (const c of vectors.default_length) expect(defaultLengthM(c.width_m, c.height_m)).toBeCloseTo(c.expected_m, 6);
    expect(DEFAULT_LENGTH_CAP_M).toBe(555_600);
  });
});

describe("a cut's origin, its host's course, its lines and keeping a side (CAP-22)", () => {
  const cuts = vectors.cases.flatMap((c) => c.cuts.map((cut) => [`${c.name} ${cut.time.slice(11, 19)}`, c, cut] as const));
  it.each(cuts)("%s", (_name, c, cut) => {
    const host = { coordinates: c.host.coordinates, times: c.host.times.map(Date.parse), ...(c.host.courses && { courses: c.host.courses }) };
    const at = Date.parse(cut.time);
    const place = cutPlace(host, at, cut.origin, c.sensor?.array_offset_m ?? 0, c.sensor?.array_mode ?? "worm_in_hole", cut.course);
    const origin = place?.position;
    samePlace(origin, cut.expected.origin, "origin");
    const course = place?.course;
    if (cut.expected.course === null) expect(course).toBeUndefined();
    else {
      expect(course!).toBeCloseTo(cut.expected.course, 9);
      expect(sideOf(course!, cut.bearing)).toBe(cut.expected.side);
    }
    if (origin) {
      const lines = drawnBearings(cut.bearing, cut.ambiguous_bearing, cut.resolved);
      expect(lines.map((l) => l.which)).toEqual(cut.expected.lines!.map((l) => l.which));
      lines.forEach((line, i) => samePlace(cutEnd(origin, line.bearing, (cut.range_m ?? cut.length_m)!), cut.expected.lines![i].end, `end ${i}`));
    }
    expect(keptFor("port", cut.bearing, cut.ambiguous_bearing, course) ?? null).toBe(cut.expected.keep_port);
    expect(keptFor("starboard", cut.bearing, cut.ambiguous_bearing, course) ?? null).toBe(cut.expected.keep_starboard);
  });
});
