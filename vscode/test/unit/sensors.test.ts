/**
 * Sensors and their cuts (CAP-22): where the map draws a cut from and to, which side a
 * bearing is on and which bearing keeping port or starboard keeps, held to the vectors
 * debrief_kernel.sensors is held to; and what lists and tooltips say of them.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DebriefFeatureCollection } from "@debrief/schemas";
import type { LonLat } from "../../webview/geodesic.js";
import {
  currentCut,
  cutChoices,
  cutNow,
  cutEnd,
  cutOrigin,
  cutsInScope,
  KEEP_CHOICES,
  resolutionFor,
  scopeChoices,
  DEFAULT_LENGTH_CAP_M,
  defaultLengthM,
  describeCut,
  drawnBearings,
  featureName,
  hostCourse,
  inPeriod,
  keptFor,
  relativeBearing,
  sensorDetail,
  sensorsOf,
  sideOf,
  type Kept,
} from "../../webview/sensors.js";
import { describeSensorInFile, hostsToAsk, sensorReadSummary, type SensorPreview } from "../../src/sensorimport.js";
import { describeStep, SENSOR_IMPORTER } from "../../src/wording.js";

const repo = path.resolve(__dirname, "../../..");
const vectors = JSON.parse(readFileSync(path.join(repo, "schemas/vectors/sensor-cuts.json"), "utf8")) as {
  relative: { course: number; bearing: number; relative: number; side: string }[];
  default_length: { width_m: number; height_m: number; expected_m: number }[];
  cases: {
    name: string;
    host: { coordinates: LonLat[]; times: string[] };
    cuts: {
      time: string;
      bearing: number;
      ambiguous_bearing?: number;
      resolved?: string;
      range_m?: number;
      length_m?: number;
      origin?: LonLat;
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
    const times = c.host.times.map(Date.parse);
    const at = Date.parse(cut.time);
    const origin = cutOrigin(c.host.coordinates, times, at, cut.origin);
    samePlace(origin, cut.expected.origin, "origin");
    const course = hostCourse(c.host.coordinates, times, at);
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

const cut = (id: string, time: string, bearing: number, more: Record<string, unknown> = {}) => ({
  type: "Feature",
  id,
  geometry: null,
  properties: { kind: "sensor_cut", sensor_id: "sensor-ta", time, bearing: { value: bearing, unit: "deg" }, ...more },
});
const plot = {
  type: "FeatureCollection",
  schema_version: "0.0.23",
  provenance: [],
  features: [
    { type: "Feature", id: "track-blue", geometry: { type: "LineString", coordinates: [[0, 0], [1, 0]] }, properties: { kind: "track", name: "BLUE ONE", times: ["2026-10-11T09:00:00.000Z", "2026-10-11T10:00:00.000Z"] } },
    { type: "Feature", id: "sensor-ta", geometry: null, properties: { kind: "sensor", name: "Towed array", host_track_id: "track-blue", colour: "#8a3ffc" } },
    cut("cut-00003", "2026-10-11T09:30:00.000Z", 50, { ambiguous_bearing: { value: 130, unit: "deg" }, resolved: "ambiguous_bearing", range: { value: 2000, unit: "[yd_i]" } }),
    cut("cut-00001", "2026-10-11T09:10:00.000Z", 45, { ambiguous_bearing: { value: 135, unit: "deg" }, label: "0910" }),
    cut("cut-00002", "2026-10-11T09:20:00.000Z", 47),
  ],
} as unknown as DebriefFeatureCollection;

describe("what is drawn when, and what is said of it", () => {
  const [entry] = sensorsOf(plot);
  it("a sensor's cuts in time order, with its host", () => {
    expect(entry.cuts.map((c) => c.id)).toEqual(["cut-00001", "cut-00002", "cut-00003"]);
    expect(entry.host?.id).toBe("track-blue");
    expect(sensorDetail(entry)).toBe("3 cuts · 1 ambiguous · 1 resolved");
  });
  it("only the cuts in the window are drawn, and the one current time is at is emphasised", () => {
    const t = (hhmm: string) => Date.parse(`2026-10-11T${hhmm}:00.000Z`);
    expect(inPeriod(entry.times, t("09:10"), t("09:20"))).toEqual([0, 2]);
    expect(inPeriod(entry.times, t("09:11"), t("09:19"))).toEqual([1, 1]);
    expect(currentCut(entry.times, t("09:25"), t("09:00"), t("10:00"))).toBe(1);
    expect(currentCut(entry.times, t("09:30"), t("09:00"), t("10:00"))).toBe(2);
    expect(currentCut(entry.times, t("09:05"), t("09:00"), t("10:00"))).toBe(-1); // none heard yet
    expect(currentCut(entry.times, t("09:25"), t("09:21"), t("10:00"))).toBe(-1); // the last is before the window
  });
  it("says a cut's bearings, its sides and which was kept", () => {
    expect(describeCut(entry.cuts[0], "Towed array", 90)).toBe("Towed array cut at 09:10:00Z\nAmbiguous: 045.0° (port) or 135.0° (starboard)\nLabel: 0910");
    expect(describeCut(entry.cuts[2], "Towed array", 90)).toBe("Towed array cut at 09:30:00Z\nBearing 130.0° (starboard) kept; 050.0° discarded\nRange 2000 yd");
    expect(featureName(entry.cuts[1], plot)).toBe("Towed array cut at 09:20:00Z");
  });
});

describe("keeping a side for the cut at the current time, the time window, the selection or all (CAP-22)", () => {
  const [entry] = sensorsOf(plot);
  const t = (hhmm: string) => Date.parse(`2026-10-11T${hhmm}:00.000Z`);
  const context = { entries: [entry], selected: ["cut-00002"], window: { start: t("09:00"), end: t("09:25") }, at: t("09:12") };
  it("offers only the scopes that hold cuts, saying how many have two bearings", () => {
    expect(scopeChoices(context).map((c) => [c.scope, c.detail])).toEqual([
      ["current", "1 cut, 1 with two bearings"],
      ["window", "2 cuts, 1 with two bearings"],
      ["selected", "1 cut, 0 with two bearings"],
      ["all", "3 cuts, 2 with two bearings"],
    ]);
  });
  it("asks for the cuts named, or the sensor and the window, or the sensor", () => {
    expect(resolutionFor("current", "port", context)).toEqual({ keep: "port", cut_ids: ["cut-00001"] });
    expect(resolutionFor("window", "starboard", context)).toEqual({ keep: "starboard", sensor_ids: ["sensor-ta"], period: { start: "2026-10-11T09:00:00.000Z", end: "2026-10-11T09:25:00.000Z" } });
    expect(resolutionFor("all", "ambiguous", context)).toEqual({ keep: "ambiguous", sensor_ids: ["sensor-ta"] });
    expect(cutsInScope("selected", { ...context, selected: ["sensor-ta"] })).toHaveLength(0); // a sensor selected is All cuts
  });
  it("says why when there is nothing to resolve", () => {
    expect(resolutionFor("selected", "port", context)).toBe("None of these cuts has two bearings.");
    expect(resolutionFor("selected", "port", { ...context, selected: [] })).toBe("Select cuts on the map first (Ctrl-click a line).");
    expect(resolutionFor("current", "port", { ...context, at: t("09:05") })).toBe("No cut is at the current time.");
  });
  it("a cut's own menu: the bearings not kept, with their sides; ambiguous again once resolved", () => {
    expect(cutChoices(entry.cuts[0], 90).map((c) => [c.label, c.keep])).toEqual([
      ["Keep 045.0° (port)", "bearing"],
      ["Keep 135.0° (starboard)", "ambiguous_bearing"],
    ]);
    expect(cutChoices(entry.cuts[2], 90).map((c) => c.keep)).toEqual(["bearing", "ambiguous"]);
    expect(cutChoices(entry.cuts[1], 90)).toEqual([]);
    expect(cutNow(entry, t("09:25"), { start: t("09:00"), end: t("10:00") })?.id).toBe("cut-00002");
    expect(cutNow(entry, t("09:25"))?.id).toBe("cut-00002");
    expect(cutNow(entry, t("09:05"))).toBeUndefined();
  });
  it("offers port, starboard and ambiguous again for every cut, as legacy did", () => {
    expect(KEEP_CHOICES.map((c) => c.keep)).toEqual(["port", "starboard", "ambiguous"]);
  });
});

describe("asking which track carries a file's sensors, as legacy asked", () => {
  const preview: SensorPreview = {
    name: "ALPHA_CUTS.dsf",
    sensors: [
      { track: "ALPHA", sensor: "Towed", name: "Towed", cuts: 600, ambiguous: 0, lines: 611, start: "", end: "", host_track_id: null, host: null },
      { track: "ALPHA", sensor: "Hull", name: "Hull", cuts: 1, ambiguous: 1, lines: 1, start: "", end: "", host_track_id: null, host: null },
      { track: "NELSON", sensor: "UNKNOWN", name: "ALPHA_CUTS.dsf", cuts: 3, ambiguous: 0, lines: 3, start: "", end: "", host_track_id: "track-nelson", host: "NELSON" },
    ],
    cuts: 604,
    fixes: 0,
    tracks: [{ id: "track-nelson", name: "NELSON" }],
    omitted: [],
    notes: [],
    content_hash: "",
    earlier: [],
  };
  it("asks once per track name the plot has no track for", () => {
    expect(hostsToAsk(preview).map((a) => [a.track, a.sensors.length])).toEqual([["ALPHA", 2]]);
    expect(describeSensorInFile(preview.sensors[1])).toBe("Hull on ALPHA: 1 cut, 1 ambiguous");
    expect(sensorReadSummary({ sensors: ["a", "b"], cuts: 1604 }, "ALPHA_CUTS.dsf")).toBe("1,604 cuts of 2 sensors read from ALPHA_CUTS.dsf.");
  });
  it("names the step by its note in the History", () => {
    expect(describeStep({ kind: "import", tool: SENSOR_IMPORTER, status: "applied", notes: ["Sensor data read from ALPHA_CUTS.dsf"] }, () => undefined).label).toBe("Sensor data read from ALPHA_CUTS.dsf");
  });
});
